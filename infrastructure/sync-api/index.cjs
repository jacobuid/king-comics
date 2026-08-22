const { createHash, timingSafeEqual } = require('node:crypto')

const bucket = process.env.DATA_BUCKET

function normalizeName(name) {
  return String(name ?? '').trim().normalize('NFKC').toLowerCase()
}

function profileId(username, pin) {
  return createHash('sha256').update(`${username}:${pin}`).digest('hex')
}

function profileKey(username, pin) {
  return `profiles/${profileId(username, pin)}.json`
}

function pinHash(username, pin) {
  return createHash('sha256').update(`${username}:${pin}`).digest('hex')
}

function validPin(pin) {
  return /^\d{4}$/.test(String(pin ?? ''))
}

function safeEqual(first, second) {
  const firstBuffer = Buffer.from(String(first))
  const secondBuffer = Buffer.from(String(second))
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer)
}

function cleanProgress(progress) {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return {}

  return Object.fromEntries(Object.entries(progress)
    .slice(0, 5000)
    .filter(([comicId, item]) => (
      comicId.length <= 300 && item && typeof item === 'object' && !Array.isArray(item)
    )))
}

function timestamp(item) {
  return typeof item?.updatedAt === 'string' ? item.updatedAt : ''
}

function mergeProgress(savedProgress, deviceProgress) {
  const merged = { ...cleanProgress(savedProgress) }

  for (const [comicId, deviceItem] of Object.entries(cleanProgress(deviceProgress))) {
    if (!merged[comicId] || timestamp(deviceItem) >= timestamp(merged[comicId])) {
      merged[comicId] = deviceItem
    }
  }

  return merged
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  }
}

function requestBody(event) {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : event.body

  if (!rawBody || rawBody.length > 1_000_000) throw new Error('INVALID_REQUEST')
  return JSON.parse(rawBody)
}

async function readProfile(client, GetObjectCommand, username, pin) {
  try {
    const result = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: profileKey(username, pin),
    }))

    return {
      etag: result.ETag,
      profile: JSON.parse(await result.Body.transformToString()),
    }
  } catch (error) {
    if (error.name === 'NoSuchKey' || [403, 404].includes(error.$metadata?.httpStatusCode)) return null
    throw error
  }
}

async function readProfileById(client, GetObjectCommand, id) {
  try {
    const result = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: `profiles/${id}.json`,
    }))
    return JSON.parse(await result.Body.transformToString())
  } catch (error) {
    if (error.name === 'NoSuchKey' || [403, 404].includes(error.$metadata?.httpStatusCode)) return null
    throw error
  }
}

async function createProfile(client, commands, body) {
  const displayName = String(body.name ?? '').trim().normalize('NFKC')
  const username = normalizeName(displayName)

  if (!username || displayName.length > 40 || !validPin(body.pin)) {
    return response(400, { error: 'Enter a name and a four-digit PIN.' })
  }

  const now = new Date().toISOString()
  const profile = {
    version: 1,
    name: displayName,
    username,
    pinHash: pinHash(username, body.pin),
    progress: cleanProgress(body.progress),
    createdAt: now,
    updatedAt: now,
  }

  try {
    await client.send(new commands.PutObjectCommand({
      Bucket: bucket,
      Key: profileKey(username, body.pin),
      Body: JSON.stringify(profile),
      ContentType: 'application/json',
      IfNoneMatch: '*',
    }))
  } catch (error) {
    if (error.name === 'PreconditionFailed' || error.$metadata?.httpStatusCode === 412) {
      return response(409, { error: 'That profile name already exists. Open it with its PIN instead.' })
    }
    throw error
  }

  return response(201, {
    name: profile.name,
    profileId: profileId(username, body.pin),
    progress: profile.progress,
  })
}

async function loadProfile(client, commands, credentials) {
  const username = normalizeName(credentials.name)
  if (!username || !validPin(credentials.pin)) {
    return response(400, { error: 'Enter a profile name and four-digit PIN.' })
  }

  const saved = await readProfile(client, commands.GetObjectCommand, username, credentials.pin)
  if (!saved) return response(404, { error: 'No synced profile was found with that name and PIN.' })
  if (!safeEqual(saved.profile.pinHash, pinHash(username, credentials.pin))) {
    return response(401, { error: 'That PIN is not correct.' })
  }

  return response(200, {
    name: saved.profile.name,
    profileId: profileId(username, credentials.pin),
    progress: saved.profile.progress,
  })
}

async function updateProfile(client, commands, body) {
  const username = normalizeName(body.name)
  if (!username || !validPin(body.pin)) {
    return response(400, { error: 'Enter a profile name and four-digit PIN.' })
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const saved = await readProfile(client, commands.GetObjectCommand, username, body.pin)
    if (!saved) return response(404, { error: 'No synced profile was found with that name.' })
    if (!safeEqual(saved.profile.pinHash, pinHash(username, body.pin))) {
      return response(401, { error: 'That PIN is not correct.' })
    }

    const progress = mergeProgress(saved.profile.progress, body.progress)
    const profile = {
      ...saved.profile,
      progress,
      updatedAt: new Date().toISOString(),
    }

    try {
      await client.send(new commands.PutObjectCommand({
        Bucket: bucket,
        Key: profileKey(username, body.pin),
        Body: JSON.stringify(profile),
        ContentType: 'application/json',
        IfMatch: saved.etag,
      }))
      return response(200, {
        name: profile.name,
        profileId: profileId(username, body.pin),
        progress,
      })
    } catch (error) {
      if (error.name !== 'PreconditionFailed' && error.$metadata?.httpStatusCode !== 412) throw error
    }
  }

  return response(409, { error: 'Two devices synced at once. Please try again.' })
}

async function deleteProfile(client, commands, id, pin) {
  if (!/^[a-f0-9]{64}$/.test(String(id ?? ''))) {
    return response(400, { error: 'The profile ID was not valid.' })
  }
  if (!validPin(pin)) return response(400, { error: 'Enter a four-digit PIN.' })

  const profile = await readProfileById(client, commands.GetObjectCommand, id)
  if (!profile) return response(404, { error: 'That profile no longer exists.' })
  if (!safeEqual(profile.pinHash, pinHash(profile.username, pin))) {
    return response(401, { error: 'That PIN is not correct.' })
  }

  await client.send(new commands.DeleteObjectCommand({
    Bucket: bucket,
    Key: `profiles/${id}.json`,
  }))
  return response(200, { deleted: true })
}

function requestCredentials(event, body = {}) {
  return {
    name: event.headers?.['x-profile-name'] ?? body.name,
    pin: event.headers?.['x-profile-pin'] ?? body.pin,
  }
}

exports.handler = async (event) => {
  try {
    const commands = require('@aws-sdk/client-s3')
    const client = new commands.S3Client({})
    const method = event.requestContext?.http?.method ?? event.httpMethod

    if (event.rawPath === '/profiles' && method === 'GET') {
      return await loadProfile(client, commands, requestCredentials(event))
    }
    if (event.rawPath === '/profiles' && method === 'DELETE') {
      return await deleteProfile(
        client,
        commands,
        event.headers?.['x-profile-id'],
        event.headers?.['x-profile-pin'],
      )
    }

    const body = requestBody(event)
    if (event.rawPath === '/profiles' && method === 'POST') {
      return await createProfile(client, commands, body)
    }
    if (event.rawPath === '/profiles' && method === 'PUT') {
      return await updateProfile(client, commands, { ...body, ...requestCredentials(event, body) })
    }

    return response(404, { error: 'Not found.' })
  } catch (error) {
    console.error(error)
    if (error.message === 'INVALID_REQUEST' || error instanceof SyntaxError) {
      return response(400, { error: 'The request was not valid.' })
    }
    return response(500, { error: 'Profile sync is temporarily unavailable.' })
  }
}

exports._test = {
  cleanProgress,
  mergeProgress,
  normalizeName,
  pinHash,
  profileId,
  profileKey,
  validPin,
}
