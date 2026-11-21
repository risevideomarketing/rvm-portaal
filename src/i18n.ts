// Taal van de interface-chrome (zijbalk, navigatie). Paginainhoud blijft voorlopig Nederlands (voorbeelddata).
export type Lang = 'nl' | 'en'

export const LANGS: { value: Lang; label: string }[] = [
  { value: 'nl', label: 'NL' },
  { value: 'en', label: 'EN' },
]

const DICT = {
  nl: {
    nav: {
      '': 'Overzicht',
      taken: 'Taken',
      planning: 'Agenda',
      opdrachten: 'Opdrachten',
      crm: 'CRM',
      productie: 'Productie',
      projecten: 'Interne projecten',
      statistieken: 'Statistieken',
      kennisbank: 'Kennisbank',
    } as Record<string, string>,
    groepen: ['Werkomgeving', 'Klanten & projecten', 'Beheer'],
    klantkant: 'Klantkant',
    portaal: 'Klantportaal',
    loggedInAs: 'Ingelogd als',
    admin: 'admin',
    resetConfirm: 'Lokale wijzigingen weggooien en terug naar de momentopname?',
    resetLabel: 'Lokaal terugzetten',
    protoBanner: 'Lokaal · momentopname van de echte gegevens, wijzigingen blijven in deze browser',
  },
  en: {
    nav: {
      '': 'Overview',
      taken: 'Tasks',
      planning: 'Planning',
      opdrachten: 'Leads found',
      crm: 'CRM',
      productie: 'Production',
      projecten: 'Internal projects',
      statistieken: 'Statistics',
      kennisbank: 'Knowledge base',
    } as Record<string, string>,
    groepen: ['Workspace', 'Clients & projects', 'Admin'],
    klantkant: 'Client side',
    portaal: 'Client portal',
    loggedInAs: 'Logged in as',
    admin: 'admin',
    resetConfirm: 'Discard local changes and go back to the snapshot?',
    resetLabel: 'Reset local data',
    protoBanner: 'Local · snapshot of the real data, changes stay in this browser',
  },
} satisfies Record<Lang, unknown>

export const t = (lang: Lang) => DICT[lang]
