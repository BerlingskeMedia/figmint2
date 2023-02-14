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
