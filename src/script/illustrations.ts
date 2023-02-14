// see https://medium.com/iadvize-engineering/using-figma-api-to-extract-illustrations-and-icons-34e0c7c230fa

import { getNamesFromProperties } from './names'
import { fetchFigmaFile, getComponentsFromNode } from './utils'

export const getIllustrationName = (componentName: string) => {
  const { name } = getNamesFromProperties(componentName)
  return name
}

export const fetchIllustrationsFromFigmaFile = async (
  fileKey: string,
  token: string,
): Promise<string[]> => {
  if (!token) {
    console.error(
      'The Figma API token is not defined, you need to set an environment variable `FIGMA_API_TOKEN` to run the script',
    )
    return []
  }
  return fetchFigmaFile(fileKey, token)
    .then((data) => getComponentsFromNode(data.document))
    .then((components: any[]) =>
      components.map(({ name }: any) => getIllustrationName(name)),
    )
}
