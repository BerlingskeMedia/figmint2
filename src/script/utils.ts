export const flatten = (acc: any[], cur: any[]) => [...acc, ...cur]

export const fetchFigmaFile = (key: string, token: string) => {
  return fetch(`https://api.figma.com/v1/files/${key}`, {
    headers: { 'X-Figma-Token': token },
  }).then((response) => response.json())
}

export const getComponentsFromNode = (node: any): any[] => {
  if (node.type === 'COMPONENT') {
    return [node]
  }
  if ('children' in node) {
    return node.children.map(getComponentsFromNode).reduce(flatten, [])
  }
  return []
}
