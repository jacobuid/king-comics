import { comics } from './comics.generated.js'

export { comics }

export const seriesList = Array.from(
  comics.reduce((seriesMap, comic) => {
    const existingSeries = seriesMap.get(comic.seriesId)

    if (existingSeries) {
      existingSeries.comics.push(comic)
    } else {
      seriesMap.set(comic.seriesId, {
        id: comic.seriesId,
        name: comic.series,
        cover: comic.cover,
        comics: [comic],
      })
    }

    return seriesMap
  }, new Map()).values(),
).sort((first, second) => first.name.localeCompare(second.name, undefined, {
  numeric: true,
  sensitivity: 'base',
}))

export function getComic(comicId) {
  return comics.find((comic) => comic.id === comicId)
}

export function getSeries(seriesId) {
  return seriesList.find((series) => series.id === seriesId)
}
