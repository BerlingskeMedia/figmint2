// see https://medium.com/iadvize-engineering/using-figma-api-to-extract-illustrations-and-icons-34e0c7c230fa

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

export const formatName = (name: string) =>
  name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // removes diacritics
    .replace(/\//g, '_') // replaces '/' by '_'
    .replace(/[^a-zA-Z0–9_]/g, '') // removes non alphanumeric or '_' characters

export const getNamesFromProperties = (nodeName: string) => {
  return nodeName
    .split(',')
    .map((property) => {
      const [key, value] = property.split('=')
      return {
        [key]: formatName(value),
      }
    })
    .reduce((acc, cur) => ({ ...acc, ...cur }), {})
}

export const getIllustrationName = (componentName: string) => {
  const { name } = getNamesFromProperties(componentName)
  return name
}

export const getIconNames = (componentName: string) => {
  const { size, name } = getNamesFromProperties(componentName)
  return { size, name }
}

export interface SVGResult {
  name: {
    size: string
    name: string
  }
  fileName: string
  svg: string
}

export const getSVGsFromComponents = (
  key: string,
  token: string,
): ((components: any[]) => Promise<SVGResult[]>) => (components: any[]) => {
  const ids = components.map(({ id }) => id)
  return fetch(
    `https://api.figma.com/v1/images/${key}?ids=${ids.join()}&format=svg`,
    { headers: { 'X-Figma-Token': token } },
  )
    .then((response) => response.json())
    .then(({ images }) =>
      Promise.all(
        components.map(({ id, name }) =>
          fetch(images[id])
            .then((response) => response.text())
            .then(
              (svg): SVGResult => ({
                name: getIconNames(name), // or "name: getIllustrationName,"
                fileName: hash(images[id]),
                svg: formatIconsSVG(svg), // or "svg,"
              }),
            ),
        ),
      ),
    )
}

export const formatIconsSVG = (svg: string) =>
  svg.replace(/fill="#[a-f0–9]{6}"/gm, 'fill="currentColor"')

const hash = (path: string) =>
  path.replace(/^.*\/img\//g, '').replace(/\//g, '_')
