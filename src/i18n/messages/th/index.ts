import type { Messages } from '../en'
import cards from './cards.json'
import commandPalette from './commandPalette.json'
import common from './common.json'
import data from './data.json'
import errors from './errors.json'
import footer from './footer.json'
import header from './header.json'
import home from './home.json'
import languages from './languages.json'
import nav from './nav.json'
import notFound from './notFound.json'

/** Must match English key for key (`satisfies Messages`; tests also check placeholders). */
export default { cards, commandPalette, common, data, errors, footer, header, home, languages, nav, notFound } satisfies Messages
