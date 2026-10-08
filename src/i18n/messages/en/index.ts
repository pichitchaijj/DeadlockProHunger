/** English, the source locale: its keys, placeholders and plural forms define every other catalog. */
import builds from './builds.json'
import cards from './cards.json'
import commandPalette from './commandPalette.json'
import common from './common.json'
import data from './data.json'
import errors from './errors.json'
import footer from './footer.json'
import header from './header.json'
import heroes from './heroes.json'
import home from './home.json'
import languages from './languages.json'
import nav from './nav.json'
import notFound from './notFound.json'

const messages = { builds, cards, commandPalette, common, data, errors, footer, header, heroes, home, languages, nav, notFound }

export type Messages = typeof messages
export default messages
