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
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null
    throw error
  }
}

async function register(client, commands, body) {
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

async function sync(client, commands, body) {
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

exports.handler = async (event) => {
  try {
    const commands = require('@aws-sdk/client-s3')
    const client = new commands.S3Client({})

    const body = requestBody(event)
    if (event.rawPath === '/register') return await register(client, commands, body)
    if (event.rawPath === '/sync') return await sync(client, commands, body)
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
