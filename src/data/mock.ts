// Vaste gegevens van het dashboard: team, fases, CRM-stappen en de kennisbank.
// Klanten, contacten en taken komen uit Supabase (live) of uit src/data/lokaal.json (lokaal, niet in git).
import type { Article, Client, Contact, Deal, Invoice, Melding, Person, Phase, Recht, Stage, Task, Project, Opdracht } from './types'

/** Het team. Live wordt deze lijst bijgewerkt uit Supabase (allowed_users), inclusief nieuwe mensen en hun rechten. */
export const TEAM: Person[] = [
  { id: 'daan', name: 'Daan', role: 'Creative producer', initials: 'DS', color: '#30A46C', photo: '/img/team/daan.webp', niveau: 'admin' },
]
/** Vaste foto's en kleuren per bekende persoon; nieuwe mensen krijgen een kleur uit KLEUREN. */
export const TEAM_VAST: Record<string, Partial<Person>> = Object.fromEntries(TEAM.map((p) => [p.id, { photo: p.photo, color: p.color, initials: p.initials, role: p.role }]))
export const KLEUREN = ['#8E4EC6', '#E54666', '#0090FF', '#12A594', '#F76B15', '#6E56CF', '#AD7F58']

/**
 * Alle rechten van een medewerker, in groepen (vinkjes op Instellingen). Beheerders hebben ze altijd allemaal.
 * standaard: wat een medewerker heeft als het vinkje nog nooit is aangeraakt.
 */
export const RECHTEN: { key: Recht; groep: string; label: string; uitleg?: string; standaard: boolean }[] = [
  { key: 'taken_alle', groep: 'Taken', label: 'Alle taken van het team zien', uitleg: 'Uit: alleen eigen taken', standaard: true },
  { key: 'taken_anderen', groep: 'Taken', label: 'Taken van anderen aanpassen', uitleg: 'Uit: andermans taken alleen bekijken en erop reageren', standaard: false },
  { key: 'vertrouwelijk', groep: 'Taken', label: 'Vertrouwelijke taken zien', standaard: false },
  { key: 'verwijderen', groep: 'Taken', label: 'Verwijderen', uitleg: 'Taken, links en contentplekken weghalen', standaard: false },
  { key: 'crm', groep: 'CRM', label: 'CRM zien', standaard: true },
  { key: 'crm_bewerken', groep: 'CRM', label: 'Contacten toevoegen en bewerken', standaard: true },
  { key: 'klanten', groep: 'Klanten en portaal', label: 'Klantdossiers zien', standaard: true },
  { key: 'klanten_bewerken', groep: 'Klanten en portaal', label: 'Dossier bewerken', uitleg: 'Gegevens, fasen, planning en links', standaard: false },
  { key: 'klanttaken', groep: 'Klanten en portaal', label: 'Klanttaken en contentplekken zetten', standaard: true },
  { key: 'portaaltoegang', groep: 'Klanten en portaal', label: 'Klant toegang geven tot het portaal', standaard: false },
  { key: 'geld', groep: 'Geld en cijfers', label: 'Bedragen, pakketprijzen en facturen', standaard: false },
  { key: 'statistieken', groep: 'Geld en cijfers', label: 'Statistieken (Moneybird, GA4, Meta)', standaard: false },
  { key: 'projecten', groep: 'Overig', label: 'Projecten van Rise (SEO, Outreach…)', standaard: true },
]

/** Videotraject met eigen voorbereiding en montage; de rest is gelijk aan het standaardtraject. */
const videoTraject = (opnameLabel: string, pre: string[], montage: string[]): Phase[] =>
  PHASES.map((f) =>
    f.key === 'preproductie' ? { ...f, steps: pre }
    : f.key === 'opnames' ? { ...f, klantLabel: opnameLabel }
    : f.key === 'montage' ? { ...f, steps: montage }
    : f)

/** Sjablonen om in één klik een set rechten te zetten (daarna nog per vinkje aan te passen). */
export const RECHTEN_SJABLONEN: { naam: string; uitleg: string; rechten: Recht[] }[] = [
  { naam: 'Stagiair', uitleg: 'Taken, CRM, klanten en projecten; geen geld, geen verwijderen', rechten: ['taken_alle', 'crm', 'crm_bewerken', 'klanten', 'klanttaken', 'projecten'] },
  { naam: 'Freelancer', uitleg: 'Alleen eigen taken en de klanten waar hij aan werkt', rechten: ['klanten', 'klanttaken'] },
  { naam: 'Sales', uitleg: 'CRM met bedragen, klanten en taken', rechten: ['taken_alle', 'crm', 'crm_bewerken', 'klanten', 'projecten', 'geld'] },
  { naam: 'Bijna alles', uitleg: 'Alles behalve het team beheren', rechten: ['taken_alle', 'taken_anderen', 'vertrouwelijk', 'verwijderen', 'crm', 'crm_bewerken', 'klanten', 'klanten_bewerken', 'klanttaken', 'portaaltoegang', 'geld', 'statistieken', 'projecten'] },
]

/** Slack-meldingen die iemand per persoon aan of uit kan zetten. */
export const MELDINGEN: { key: Melding; label: string }[] = [
  { key: 'deadline', label: 'Deadline morgen om 18:00' },
  { key: 'stil', label: 'Gestart, maar 24 werkuren geen update' },
  { key: 'tag', label: 'Iemand tagt je bij een taak' },
  { key: 'opvolgen', label: 'Vandaag een contact opvolgen' },
]

/** Standaardtraject: een videoproductie, van eerste gesprek tot oplevering. Per klant aan te passen (Client.phases). */
export const PHASES: Phase[] = [
  { key: 'kennismaking', label: 'Kennismaking & briefing', klantLabel: 'We leren je kennen', steps: ['Intake gehad (doel, doelgroep, deadline, budget, kanalen)', 'Go/no-go: past het bij ons', 'Portaal-login aangemaakt'] },
  { key: 'voorstel', label: 'Voorstel & akkoord', klantLabel: 'Je voorstel staat klaar', steps: ['Scope vastgelegd (deliverables, formats, lengtes, versies)', 'Offerte verstuurd', 'Akkoord ontvangen', 'Aanbetaling 35% gefactureerd'] },
  { key: 'preproductie', label: 'Pre-productie', klantLabel: 'We bereiden de opnames voor', steps: ['Concept en script klaar', 'Draaiboek en shotlist klaar', 'Draaidag, locatie en mensen bevestigd'] },
  { key: 'opnames', label: 'Opnames', klantLabel: 'We filmen', steps: ['Draaidag gehad', 'Beeldmateriaal op 2 schijven veiliggesteld'] },
  { key: 'montage', label: 'Montage', klantLabel: 'Je video wordt gemonteerd', steps: ['Selectie gemaakt', 'Eerste versie in Frame.io'] },
  { key: 'feedback', label: 'Feedback & afronding', klantLabel: 'We verwerken je feedback', steps: ['Feedback verwerkt', 'Ondertiteling en kleur gecheckt', 'Definitief akkoord'] },
  { key: 'oplevering', label: 'Oplevering', klantLabel: 'Je video is klaar', steps: ['Alle formaten opgeleverd', 'Eindfactuur 65% verstuurd', 'Back-up in de cloud (Final en Final - no assets)'] },
]

/** Sjablonen om het traject van een klant mee te beginnen; daarna is alles per klant aan te passen. */
export const TRAJECTEN: { naam: string; fasen: Phase[] }[] = [
  { naam: 'Videoproductie (standaard)', fasen: PHASES },
  { naam: 'Bedrijfsfilm / brandmovie', fasen: videoTraject('We maken je bedrijfsfilm', ['Concept en verhaallijn klaar', 'Script en interviewvragen klaar', 'Draaiboek en shotlist klaar', 'Draaidag, locatie en mensen bevestigd'], ['Selectie gemaakt', 'Muziek gekozen', 'Eerste versie in Frame.io']) },
  { naam: 'Aftermovie / eventvideo', fasen: videoTraject('We filmen je event', ['Programma en sprekers ontvangen', 'Shotlist en must-haves klaar', 'Toegang en parkeren geregeld'], ['Beste momenten geselecteerd', 'Muziek gekozen', 'Eerste versie in Frame.io']) },
  { naam: 'Commercial / reclamevideo', fasen: videoTraject('We draaien je commercial', ['Creatief concept akkoord', 'Script en storyboard klaar', 'Cast, locatie en props geregeld'], ['Selectie gemaakt', 'Grading en sound design', 'Eerste versie in Frame.io']) },
  { naam: 'Social video\'s / ad content', fasen: videoTraject('We maken je social video\'s', ['Hooks en scripts klaar', 'Formats bepaald (9:16, 4:5, 1:1)', 'Draaidag bevestigd'], ['Varianten gemonteerd', 'Ondertitels toegevoegd', 'Eerste versies in Frame.io']) },
  { naam: 'Productvideo', fasen: videoTraject('We filmen je product', ['Producten ontvangen', 'Shotlist en stijl klaar', 'Studio of locatie bevestigd'], ['Selectie gemaakt', 'Eerste versie in Frame.io']) },
  { naam: 'Testimonial video', fasen: videoTraject('We filmen je klantverhalen', ['Klanten benaderd en akkoord', 'Interviewvragen klaar', 'Draaidag en locatie bevestigd'], ['Antwoorden per vraag geselecteerd', 'Eerste versie in Frame.io']) },
  { naam: 'Recruitmentvideo', fasen: videoTraject('We filmen je werkgeversverhaal', ['Vacature en doelgroep helder', 'Medewerkers voor beeld gekozen', 'Interviewvragen en draaiboek klaar'], ['Selectie gemaakt', 'Eerste versie in Frame.io']) },
  { naam: 'Drone-opnames', fasen: videoTraject('We vliegen voor je', ['Locatie en luchtruim gecheckt', 'Toestemming terreineigenaar', 'Vliegdag gepland (weer gecheckt)'], ['Beste shots geselecteerd', 'Eerste versie in Frame.io']) },
  { naam: 'Livestream', fasen: [
    { key: 'kennismaking', label: 'Kennismaking & briefing', klantLabel: 'We leren je kennen', steps: ['Intake gehad (programma, platform, kijkers)', 'Portaal-login aangemaakt'] },
    { key: 'voorstel', label: 'Voorstel & akkoord', klantLabel: 'Je voorstel staat klaar', steps: ['Offerte verstuurd', 'Akkoord ontvangen', 'Aanbetaling 35% gefactureerd'] },
    { key: 'voorbereiding', label: 'Voorbereiding', klantLabel: 'We bereiden de stream voor', steps: ['Internet op locatie getest', 'Streamlink en platform ingericht', 'Draaiboek en regie klaar', 'Generale repetitie'] },
    { key: 'live', label: 'Live', klantLabel: 'We gaan live', steps: ['Stream gedraaid', 'Opname veiliggesteld'] },
    { key: 'oplevering', label: 'Oplevering', klantLabel: 'Je opname staat klaar', steps: ['Terugkijkversie opgeleverd', 'Eindfactuur 65% verstuurd'] },
  ] },
  { naam: 'Podcast', fasen: videoTraject('We nemen je podcast op', ['Format en gasten bepaald', 'Studio of locatie bevestigd', 'Vragen per aflevering klaar'], ['Afleveringen gemonteerd', 'Shorts gemaakt', 'Eerste versies in Frame.io']) },
  { naam: 'Alleen montage', fasen: [
    { key: 'kennismaking', label: 'Kennismaking & briefing', klantLabel: 'We leren je kennen', steps: ['Briefing gehad (doel, lengte, formats, stijl)', 'Portaal-login aangemaakt'] },
    { key: 'voorstel', label: 'Voorstel & akkoord', klantLabel: 'Je voorstel staat klaar', steps: ['Offerte verstuurd', 'Akkoord ontvangen'] },
    { key: 'materiaal', label: 'Materiaal ontvangen', klantLabel: 'We ontvangen je beeldmateriaal', steps: ['Beeldmateriaal ontvangen', 'Huisstijl, logo en muziekwensen ontvangen', 'Materiaal gecheckt en veiliggesteld'] },
    { key: 'montage', label: 'Montage', klantLabel: 'Je video wordt gemonteerd', steps: ['Spot-timeline gemaakt', 'Eerste versie in Frame.io'] },
    { key: 'feedback', label: 'Feedback & afronding', klantLabel: 'We verwerken je feedback', steps: ['Feedback verwerkt', 'Ondertiteling en kleur gecheckt', 'Definitief akkoord'] },
    { key: 'oplevering', label: 'Oplevering', klantLabel: 'Je video is klaar', steps: ['Alle formaten opgeleverd', 'Factuur verstuurd'] },
  ] },
  {
    naam: 'Strippenkaart / vaste opdrachtgever',
    fasen: [
      { key: 'kennismaking', label: 'Kennismaking & afspraken', klantLabel: 'We leren je kennen', steps: ['Kick-off gehad', 'Strippenkaart of jaarplanning akkoord', 'Huisstijl en logo ontvangen', 'Portaal-login aangemaakt'] },
      { key: 'planning', label: 'Jaar- of kwartaalplanning', klantLabel: 'We plannen je video\'s', steps: ["Onderwerpen en momenten gepland", 'Draaidagen in de agenda'] },
      { key: 'productie', label: 'Producties lopen', klantLabel: 'We maken je video\'s', steps: ['Video\'s volgens planning gefilmd', 'Opgeleverd in Frame.io'] },
      { key: 'evaluatie', label: 'Evaluatie & verlenging', klantLabel: 'We kijken samen terug', steps: ['Evaluatiegesprek gehad', 'Nieuwe strippenkaart of planning voorgesteld'] },
    ],
  },
  {
    naam: 'Social media beheer',
    fasen: [
      { key: 'kennismaking', label: 'Kennismaking & toegang', klantLabel: 'We leren je kennen', steps: ['Kick-off gehad', 'Toegang Instagram', 'Toegang LinkedIn-bedrijfspagina', 'Toegang YouTube', 'Portaal-login aangemaakt'] },
      { key: 'plan', label: 'Strategie & contentplanning', klantLabel: 'We maken het plan', steps: ['Doelen en doelgroep vastgelegd', 'Contentkalender eerste maand klaar'] },
      { key: 'content', label: 'Content maken', klantLabel: 'Je content wordt gemaakt', steps: ['Eerste posts en video\'s klaar', 'Akkoord klant'] },
      { key: 'doorlopend', label: 'Doorlopend & rapportage', klantLabel: 'We posten en houden je op de hoogte', steps: ['Posts volgens planning', 'Maandoverzicht verstuurd', 'Maandgesprek gehad'] },
    ],
  },
  {
    naam: 'Advertentiebeheer / online campagne',
    fasen: [
      { key: 'kennismaking', label: 'Kennismaking & toegang', klantLabel: 'We leren je kennen', steps: ['Kick-off gehad (doel, budget, doelgroep)', 'Toegang Meta Business Manager', 'Pixel en conversies gecheckt', 'Portaal-login aangemaakt'] },
      { key: 'plan', label: 'Strategie & creatives', klantLabel: 'We maken het plan', steps: ['Campagnestructuur vastgelegd', 'Ad creatives klaar', 'Akkoord klant'] },
      { key: 'live', label: 'Campagnes live', klantLabel: 'Je campagnes lopen', steps: ['Campagnes live', 'Eerste week geoptimaliseerd'] },
      { key: 'doorlopend', label: 'Optimalisatie & rapportage', klantLabel: 'We optimaliseren en rapporteren', steps: ['Nieuwe creatives getest', 'Maandrapportage verstuurd', 'Maandgesprek gehad'] },
    ],
  },
  {
    naam: 'Website',
    fasen: [
      { key: 'kennismaking', label: 'Kennismaking', klantLabel: 'We leren je kennen', steps: ['Kick-off gehad', 'Toegang domein en hosting', 'Portaal-login aangemaakt'] },
      { key: 'opzet', label: 'Opzet & teksten', klantLabel: 'We maken de opzet', steps: ["Pagina's en structuur vastgelegd", 'Teksten geschreven'] },
      { key: 'bouwen', label: 'Website bouwen', klantLabel: 'Je website wordt gebouwd', steps: ['Ontwerp gemaakt', 'Feedback klant verwerkt', 'Akkoord klant'] },
      { key: 'live', label: 'Live', klantLabel: 'Je website is live', steps: ['Website live', 'Google Analytics gekoppeld', 'Aangemeld bij Google Search Console'] },
    ],
  },
]

/** Fasen van deze klant: eigen fasen als die er zijn, anders het standaardtraject. */
export const fasenVan = (c: Pick<Client, 'phases'>): Phase[] => (c.phases?.length ? c.phases : PHASES)
/** Huidige fase van de klant (ook als er fasen zijn weggehaald). */
export const faseVan = (c: Pick<Client, 'phases' | 'phase'>): Phase => {
  const f = fasenVan(c)
  return f[Math.min(Math.max(c.phase, 0), f.length - 1)]
}

/** CRM-fases met een kleur per fase, zoals in Notion: tekstkleur, lichte achtergrond voor het label en een vleugje in de kolom. */
export const STAGES = [
  { key: 'koud', label: 'Koude prospect', kleur: '#6F6E69', bg: '#EDEDEB', kolom: '#F4F4F2' },
  { key: 'gemaild', label: 'Gemaild', kleur: '#2B6E99', bg: '#DCEBF5', kolom: '#EEF5FA' },
  { key: 'lead', label: 'Lead', kleur: '#7B4FA0', bg: '#EBE2F3', kolom: '#F5F0F9' },
  { key: 'voorstel', label: 'Voorstel gestuurd', kleur: '#B85F0B', bg: '#FAE3CC', kolom: '#FCF2E8' },
  { key: 'klant', label: 'Klant', kleur: '#3B7354', bg: '#DCEBDF', kolom: '#EEF5EF' },
  { key: 'extra', label: 'Klant · Extra aandacht', kleur: '#B33E39', bg: '#F8DCDA', kolom: '#FCEFEE' },
] as const
/** Alle fasen, ook 'afgehandeld' (staat niet meer in de pipeline, wel bij Alle contacten). */
export const ALLE_STAGES = [...STAGES, { key: 'afgehandeld', label: 'Afgehandeld', kleur: '#6F6E69', bg: '#EDEDEB', kolom: '#F4F4F2' }] as const
/** Klant of klant die extra aandacht nodig heeft. */
export const isKlant = (stage: string) => stage === 'klant' || stage === 'extra'

/** Fasen op het bord Productie. */
export const PRODUCTIE_FASEN = [
  { key: 'productie', label: 'Productie', kleur: '#3B7354', bg: '#DCEBDF', kolom: '#EEF5EF' },
  { key: 'filmen', label: 'Filmen', kleur: '#2B6E99', bg: '#DCEBF5', kolom: '#EEF5FA' },
  { key: 'edit1', label: 'Edit V1', kleur: '#2B6E99', bg: '#DCEBF5', kolom: '#EEF5FA' },
  { key: 'edit2', label: 'Edit V2/V3/V4', kleur: '#B85F0B', bg: '#FAE3CC', kolom: '#FCF2E8' },
  { key: 'feedback', label: 'Wachten op feedback', kleur: '#7B4FA0', bg: '#EBE2F3', kolom: '#F5F0F9' },
  { key: 'live', label: 'Live', kleur: '#3B7354', bg: '#DCEBDF', kolom: '#EEF5EF' },
] as const
/** Fasen op het bord Interne projecten. */
export const INTERN_FASEN = [
  { key: 'gepland', label: 'Gepland', kleur: '#6F6E69', bg: '#EDEDEB', kolom: '#F4F4F2' },
  { key: 'bezig', label: 'Bezig', kleur: '#2B6E99', bg: '#DCEBF5', kolom: '#EEF5FA' },
  { key: 'doorlopend', label: 'Doorlopend', kleur: '#7B4FA0', bg: '#EBE2F3', kolom: '#F5F0F9' },
  { key: 'afgerond', label: 'Afgerond', kleur: '#3B7354', bg: '#DCEBDF', kolom: '#EEF5EF' },
] as const
export const CONTENT_SOORTEN = [
  { key: 'video', label: "Video's" },
  { key: 'static', label: 'Statics' },
  { key: 'ugc', label: 'UGC' },
  { key: 'script', label: 'Scripts & concepten' },
  { key: 'revisie', label: 'Revisies' },
  { key: 'mail', label: 'Mails' },
  { key: 'post', label: 'Posts' },
] as const
/** Soorten die een project kunnen zijn (Mails en Posts komen uit de contentkalender). */
export const PROJECT_SOORTEN = CONTENT_SOORTEN.filter((c) => c.key !== 'mail' && c.key !== 'post')

/** Lokaal zonder Supabase: momentopname van de echte gegevens uit src/data/lokaal.json (staat in .gitignore).
 * Bestaat het bestand niet, dan begint het dashboard leeg. Komt nooit in de live build. */
const lokaal = import.meta.env.DEV
  ? (Object.values(import.meta.glob('./lokaal.json', { eager: true, import: 'default' }))[0] as { tasks: Task[]; contacts: Contact[]; clients: Client[]; projects?: Project[]; opdrachten?: Opdracht[]; kennisbank?: Article[] } | undefined)
  : undefined
export const CLIENTS: Client[] = lokaal?.clients ?? []
export const CONTACTS: Contact[] = lokaal?.contacts ?? []
export const TASKS: Task[] = lokaal?.tasks ?? []
export const OPDRACHTEN: Opdracht[] = lokaal?.opdrachten ?? []

/** Eigen projecten van Rise om mee te beginnen (live staan ze in de tabel projects, zie supabase/2026-11-19-projecten-en-weekcijfers.sql). */
export const STARTPROJECTEN: Project[] = [
  { id: 'seo', name: 'SEO', soort: 'intern', fase: 'doorlopend', description: 'Vindbaarheid van risevideomarketing.nl in Google en AI-zoekmachines.', website: 'risevideomarketing.nl', createdAt: '2026-11-20T08:00:00.000Z', updates: [] },
  { id: 'outreach', name: 'Outreach', soort: 'intern', fase: 'doorlopend', description: 'Nieuwe opdrachtgevers benaderen: mail, LinkedIn, bellen, netwerk.', createdAt: '2026-11-20T08:00:00.000Z', updates: [] },
]
export const PROJECTS: Project[] = lokaal?.projects ?? STARTPROJECTEN

/** Kennisbank: staat in Supabase (tabel kennisbank), lokaal in lokaal.json. Zo staat er geen interne kennis in de code. */
export const ARTICLES_LOKAAL: Article[] = lokaal?.kennisbank ?? []

export const SOORTEN = ['Sales', 'Directe omzet', 'Klantwerk', 'Business improvement', 'Geld besparen', 'Privé'] as const

/** Documenten per klant: offertes, voorstellen, contracten. Straks uit Supabase Storage of Drive. */
export const DOCUMENTS: { id: string; clientId: string; title: string; meta: string; soort: string }[] = []

/** Facturen per klant. Straks uit Moneybird, alleen de eigen facturen van de klant, als PDF. */
export const INVOICES: Invoice[] = []

/** Wat Claude op de achtergrond heeft gedaan. Straks gevuld door geplande taken en Netlify Functions. */
export const CLAUDE_LOG: { at: string; text: string }[] = []

export const STRIP_MATEN: Record<'klein' | 'halve' | 'medium' | 'groot', { label: string; uitleg: string }> = {
  klein: { label: 'Kleine shoot', uitleg: '0,5 dag filmen + hele dag edit. Pro 4K beeld, cameraman, assistent (indien nodig), muziek, color grading, editing. Opgeleverd in alle formaten.' },
  halve: { label: 'Halve strip', uitleg: 'Alleen editing, of een korte opname.' },
  medium: { label: 'Medium shoot', uitleg: '1 hele draaidag. Pro 6K beeld, licht, geluid, Director of Photography, assistent, muziek, color grading, editing. Drone en fotografie op aanvraag. Opgeleverd in alle formaten.' },
  groot: { label: 'Grote productie', uitleg: 'Meerdere draaidagen of locaties, naar afspraak.' },
}

export const STANDAARD_SPELREGELS = [
  'Als je een van je strippen wilt gebruiken, kun je een aanvraag doen per mail of telefoon. Op elk moment kun je aankloppen om de strippen te verzilveren.',
  'Hoe eerder je de datum van de shoot kunt melden, hoe beter. Twee dagen van tevoren bellen is ook prima, maar bij voorkeur een paar weken van tevoren of nog eerder.',
  'Per video spreken we duidelijk af wat het gewenste oplevermateriaal is.',
  'We factureren 1x per kwartaal op de aangegeven data, zolang dit in verhouding staat met het strippenkaartgebruik. Worden er in één kwartaal veel video\'s afgenomen, dan factureren we dat kwartaal meer, nooit boven de offerte uit.',
]

/** Kaarten in de pipeline: elke deal apart; een contact zonder deals (of een klant zonder lopende klant-deal) als eigen kaart. */
export interface PipelineItem { key: string; contact: Contact; deal?: Deal; stage: Stage; value: number; titel: string }
export function pipelineItems(contacts: Contact[]): PipelineItem[] {
  return contacts.flatMap((c) => {
    const deals = c.deals ?? []
    const items: PipelineItem[] = deals.map((d) => ({ key: `d:${c.id}:${d.id}`, contact: c, deal: d, stage: d.stage, value: d.value, titel: d.titel || c.company }))
    const eigen = deals.length === 0 || (isKlant(c.stage) && !deals.some((d) => isKlant(d.stage)))
    if (eigen) items.push({ key: `c:${c.id}`, contact: c, stage: c.stage, value: deals.length ? 0 : c.value, titel: c.company })
    return items
  })
}
