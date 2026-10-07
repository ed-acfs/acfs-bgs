// The tests read the interface in Italian, as an Italian browser would see it: the language
// follows the browser's (see `pickLanguage`), and jsdom's is English.
Object.defineProperty(navigator, 'languages', { value: ['it-IT'], configurable: true });
Object.defineProperty(navigator, 'language', { value: 'it-IT', configurable: true });
