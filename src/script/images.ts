import fs from 'fs'
import path from 'path'
import camelCase from 'camelcase'
import rimraf from 'rimraf'
import { downloadImage, PartialFigmintExportType } from '../utils'
import * as Figma from 'figma-js'
import { DownloadListType, FinalExportsType } from './types'

export interface FetchImageUrls {
  client: Figma.ClientInterface
  file: string
  output: string
  downloadLists: DownloadListType
  finalExports: FinalExportsType
}

export type FigmaImage = PartialFigmintExportType | undefined

export const addImageToExports = (
  image: FigmaImage,
  finalExports: any,
  { outUrl, outDirectory, outFile }: any,
) => {
  if (!image) return
  if (image.format === 'png' || image.format === 'jpg') {
    finalExports[image.page][image.name][image.format]![image.scale] = {
      ...finalExports[image.page][image.name][image.format]![image.scale],
      url: outUrl,
      directory: outDirectory,
      file: outFile,
    }
  } else {
    finalExports[image.page][image.name][image.format] = {
      ...finalExports[image.page][image.name][image.format]!,
      url: outUrl,
      directory: outDirectory,
      file: outFile,
    }
  }
}

export const downloadAndStoreImage = (
  image: FigmaImage,
  { baseDirectory, url, finalExports }: any,
) => {
  if (!image) return
  // store images based on the page
  const outDirectory = path.join(baseDirectory, camelCase(image.page))

  // image file name based on format and scale
  const outFile = `${image.name}${image.scale > 1 ? `@${image.scale}x` : ''}.${
    image.format
  }`

  const outUrl = path.join(outDirectory, outFile)

  // make sure the directory for this image exists directory exists
  if (!fs.existsSync(outDirectory)) {
    fs.mkdirSync(outDirectory, { recursive: true })
  }

  downloadImage(url, outUrl)
  addImageToExports(image, finalExports, { outUrl, outDirectory, outFile })
}

export const fetchImageUrls = async ({
  client,
  file,
  output,
  downloadLists,
  finalExports,
}: FetchImageUrls): Promise<FinalExportsType> => {
  const baseDirectory = path.join(output, 'exports')

  // Clear out the output dir if it already exists
  if (fs.existsSync(baseDirectory)) {
    rimraf.sync(baseDirectory)
  }

  fs.mkdirSync(baseDirectory, { recursive: true })

  await Promise.all(
    Object.keys(downloadLists).map(async (format) => {
      if (downloadLists[format].length > 0) {
        let imageResponse

        // first we get the image urls from figma based on format and scale
        if (format === 'svg' || format === 'pdf') {
          imageResponse = await client.fileImages(file, {
            format,
            ids: downloadLists[format].map((image: any) => image.id),
          })
        } else {
          imageResponse = await client.fileImages(file, {
            format: downloadLists[format][0].format,
            scale: downloadLists[format][0].scale,
            ids: downloadLists[format].map((image: any) => image.id),
          })
        }

        // next we use these urls to download the images and add the url and file info to our exports object
        Object.entries(imageResponse.data.images).forEach(([id, url]: any) => {
          const image = downloadLists[format].find(
            (image: any) => image.id === id,
          )

          downloadAndStoreImage(image, { baseDirectory, url, finalExports })
        })
      }
    }),
  )

  return finalExports
}
