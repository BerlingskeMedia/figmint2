// see https://medium.com/iadvize-engineering/using-figma-api-to-extract-illustrations-and-icons-34e0c7c230fa

import { getNamesFromProperties } from './names'

export const getIllustrationName = (componentName: string) => {
  const { name } = getNamesFromProperties(componentName)
  return name
}

const fetchFigmaFile = (key: string, token: string) => {
  return fetch(`https://api.figma.com/v1/files/${key}`, {
    headers: { 'X-Figma-Token': token },
  }).then((response) => response.json())
}

const flatten = (acc: any[], cur: any[]) => [...acc, ...cur]
const getComponentsFromNode = (node: any): any[] => {
  if (node.type === 'COMPONENT') {
    return [node]
  }
  if ('children' in node) {
    return node.children.map(getComponentsFromNode).reduce(flatten, [])
  }
  return []
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
