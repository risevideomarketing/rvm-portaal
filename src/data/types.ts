/** Teamlid-id (bijv. 'lars'); nieuwe mensen krijgen een id op basis van hun naam. */
export type PersonId = string

/** Niveau: beheerder (mag alles) of medewerker (alleen wat aangevinkt is). */
export type Niveau = 'admin' | 'medewerker' | 'uit'
export type Recht =
  | 'taken_alle' | 'taken_anderen' | 'vertrouwelijk' | 'verwijderen'
  | 'crm' | 'crm_bewerken'
  | 'klanten' | 'klanten_bewerken' | 'klanttaken' | 'portaaltoegang'
  | 'geld' | 'statistieken' | 'projecten'
export type Melding = 'deadline' | 'stil' | 'tag' | 'opvolgen'
export type Rechten = Partial<Record<Recht, boolean>>

export interface Person {
  id: PersonId
  name: string
  role: string
  initials: string
  color: string
  photo?: string
  niveau?: Niveau
  rechten?: Rechten
  email?: string
  /** Slack-meldingen die deze persoon niet wil (false = uit). */
  meldingen?: Partial<Record<Melding, boolean>>
}

export type Priority = 'hoog' | 'middel' | 'laag'
export type Soort = 'Sales' | 'Directe omzet' | 'Klantwerk' | 'Business improvement' | 'Geld besparen' | 'Systemen' | 'Privé'
export type TaskStatus = 'todo' | 'bezig' | 'review' | 'klaar'

export interface Comment {
  id: string
  author: PersonId
  text: string
  at: string
}

export interface Subtask {
  id: string
  title: string
  /** "Af vóór"-datum van deze stap (zelfde regel als de taak: echte deadline de dag ervoor). Eigen afspraak in de agenda. */
  deadline?: string
  done: boolean
  doneAt?: string
  doneBy?: PersonId
}

export interface Task {
  id: string
  title: string
  description?: string
  priority: Priority
  soort: Soort
  deadline: string
  assignee: PersonId
  /** Expliciet de taak van één persoon: alleen dan staat de profielfoto bij de taak. */
  alleenVoor?: boolean
  /** Alleen zichtbaar voor beheerders en medewerkers met het recht "vertrouwelijk". */
  vertrouwelijk?: boolean
  status: TaskStatus
  clientId?: string
  contactId?: string
  /** Taak hoort bij een eigen Rise-project (SEO, Outreach…). */
  projectId?: string
  /** Projecttaak die op de to-do lijst staat. Projecttaken staan er standaard niet op; klant- en losse taken altijd. */
  inTodo?: boolean
  inAgenda: boolean
  comments: Comment[]
  /** Deeltaken. Het systeem stelt ze voor, de eigenaar bevestigt (subtasksConfirmed). */
  subtasks?: Subtask[]
  subtasksConfirmed?: boolean
  /** Moment waarop iemand op "Start" klikte. */
  startedAt?: string
  /** Laatste update (deeltaak afgevinkt, opmerking, fase gewijzigd). Basis voor de 24-uursmelding. */
  updatedAt?: string
  /** Gezet als het systeem de taak zelf heeft aangemaakt, bijv. 'reminder:<mail-id>'. Voorkomt dubbele reminders. */
  auto?: string
  /** Aangeleverd door de klant via het portaal (link, bestand of datum). */
  doorKlant?: boolean
}

/** 'extra' = klant die extra aandacht nodig heeft. 'afgehandeld' staat niet meer in de pipeline, alleen nog bij Alle contacten. */
export type Stage = 'koud' | 'gemaild' | 'lead' | 'voorstel' | 'klant' | 'extra' | 'afgehandeld'

export type TimelineKind = 'mail-in' | 'mail-uit' | 'whatsapp' | 'notitie' | 'gesprek'

export interface TimelineItem {
  id: string
  kind: TimelineKind
  at: string
  author?: PersonId
  subject?: string
  body: string
  image?: string
}

export interface Contact {
  id: string
  name: string
  company: string
  role: string
  email: string
  phone: string
  stage: Stage
  value: number
  owner: PersonId
  source: string
  timeline: TimelineItem[]
  /** Website van het bedrijf; daaruit komt automatisch het logo (favicon). */
  website?: string
  /** Eigen logo (geüpload, verkleind tot max. 256px), wint van het automatische logo. */
  logo?: string
  /** Opnieuw benaderen op deze datum (YYYY-MM-DD): die ochtend krijgt de eigenaar een Slack-melding. Geen taak nodig. */
  opvolgen?: string
  /** Extra contactpersonen bij dit bedrijf (de eerste staat in name/email/phone). */
  personen?: Contactpersoon[]
  /** Deals: wat we verkopen (een project, video of campagne). Een bestaande klant kan meerdere deals hebben. */
  deals?: Deal[]
}

/** Een deal in de pipeline: een specifiek project of een video voor dit bedrijf. */
export interface Deal {
  id: string
  titel: string
  stage: Stage
  value: number
  owner?: PersonId
  createdAt: string
  /** Bijv. "Bedrijfsfilm", uit de sjablonen. */
  dienst?: string
  /** Project in het klantdossier dat bij akkoord voor deze opdracht is gemaakt. */
  projectId?: string
}

export interface Contactpersoon {
  id: string
  naam: string
  rol?: string
  email?: string
  telefoon?: string
}

/** Geüpload bestand (pdf, script, brief, beeld) in de Rise-opslag. Alleen voor het team. */
export interface Bestand {
  id: string
  naam: string
  /** Pad in de opslag (bucket "bestanden"); lokaal een data-url. */
  pad: string
  type: string
  grootte: number
  at: string
  by?: PersonId
}

/** Fase in het traject van een klant, met de stappen die het team afvinkt. */
export interface Phase {
  key: string
  label: string
  /** Hoe de klant de fase in het portaal ziet. */
  klantLabel: string
  steps: string[]
}

export interface Client {
  id: string
  name: string
  subdomain: string
  contactId?: string
  pakket: string
  start: string
  phase: number
  doneSteps: string[]
  /** Eigen fasen en onboardingstappen voor deze klant. Leeg = het standaardtraject (PHASES). */
  phases?: Phase[]
  frameUrl: string
  nextShoot?: string
  onboardingVideoUrl?: string
  /** Bestanden en links (Drive-mappen, Google Docs, pdf's, brand guidelines). klant: ook zichtbaar in het portaal. */
  links?: ClientLink[]
  /** Planning voor de klant: shootdagen, livegang, opleveringen. */
  planning?: PlanItem[]
  /** Meta-advertentieaccount van de klant (act_…), gedeeld met het Rise-portfolio. */
  metaAdAccount?: string
  /** Uitgaven en kosten per resultaat tonen in het portaal (standaard aan). */
  metaUitgavenTonen?: boolean
  /** We doen (ook) de website van deze klant: dan is er een tabblad Google Analytics in de statistieken. */
  websiteWerk?: boolean
  /** GA4-property-ID van de klantwebsite (cijfers, alleen Viewer-toegang voor het Rise-serviceaccount). */
  ga4PropertyId?: string
  /** Mailadressen van de klant die in het portaal mogen inloggen. */
  logins?: string[]
  /** Taken voor de klant zelf (content aanleveren, toegang geven). Staan in het portaal; nieuwe gaan gebundeld per mail (na 30 min). */
  klantTaken?: KlantTaak[]
  /** Waar de content staat (Drive, SharePoint, Dropbox, Frame.io…). Rise en de klant voegen links toe; weghalen vraagt een extra bevestiging. */
  contentPlekken?: ContentPlek[]
  /** Hulpvragen uit het portaal (nieuwste eerst). Komen ook binnen in Slack. */
  hulpvragen?: Hulpvraag[]
  /** Moneybird-contact voor de facturen in het portaal. Leeg = zoeken op bedrijfsnaam. */
  moneybirdContactId?: string
  /** Meerdere Moneybird-contacten (bijv. aparte contactpersonen); gaat voor moneybirdContactId. */
  moneybirdContactIds?: string[]
  /** Mailadressen van de klant die geen taakmails meer willen (afgemeld via de link in de mail). */
  mailUit?: string[]
  /** Indeling van het klantportaal (leeg = 1, de Cockpit; 0 = de oorspronkelijke; 2 t/m 6 = Tabbladen, Bento, Tijdlijn, Verhaal, Jij-Rise-Klaar). */
  portaalIndeling?: number
  /** Kanalen in de contentkalender, bijv. ['Instagram', 'LinkedIn'] of ['Maillijst']. Leeg = geen contentkalender. */
  kanalen?: string[]
  contentKalender?: ContentItem[]
  /** Pdf's en andere bestanden bij deze klant (alleen team). */
  bestanden?: Bestand[]
  /** Meta-commissie: percentage van de aankoopwaarde (ex btw) dat op de factuur komt. Leeg = geen commissie. */
  commissiePct?: number
  /** Welke aankopen tellen, zoals schriftelijk afgesproken. Bepaalt ook het Meta-attributievenster. */
  commissieVenster?: CommissieVenster
  /** Maanden (YYYY-MM) waarvan de commissie al op een conceptfactuur staat. */
  commissieGefactureerd?: Record<string, { bedrag: number; at: string; by?: PersonId }>
  /** Producties voor deze klant, zoals de klant ze in het portaal ziet (automatisch bijgewerkt vanuit Productie). */
  producties?: PortaalProductie[]
  /** Strippenkaart van deze klant (leeg = geen strippenkaart). Ook zichtbaar in het portaal. */
  strippenkaart?: Strippenkaart
}

/** Eén strip op de strippenkaart. done = verzilverd. */
export interface Strip {
  id: string
  /** Wat het is, bijv. "Ondernemersdiner avond". Leeg = nog niet ingevuld. */
  titel: string
  maat: 'klein' | 'halve' | 'medium' | 'groot'
  done: boolean
  /** Datum van de shoot of oplevering (YYYY-MM-DD). */
  datum?: string
}

export interface StrippenTermijn {
  id: string
  /** Factuurdatum (YYYY-MM-DD). */
  datum: string
  omschrijving: string
  bedrag?: number
  gefactureerd: boolean
}

export interface Strippenkaart {
  titel: string
  strippen: Strip[]
  facturatie: StrippenTermijn[]
  spelregels: string[]
}

/** Opdracht gevonden door de dagelijkse scan (Young Creators, Freelancer.nl, Hoofdkraan, TenderNed, web). */
export interface Opdracht {
  id: string
  title: string
  source: string
  url: string
  type?: string
  client?: string
  location?: string
  budget?: string
  deadline?: string
  posted?: string
  /** Gevonden op (YYYY-MM-DD). */
  found_at: string
  /** 3 = past sterk, 2 = passend, 1 = klein of randgeval. */
  relevance: number
  status: 'open' | 'bewaard' | 'weg' | 'lead'
}

/** Status van een contentitem (mail, post) in de contentkalender. */
export type ContentStatus = 'open' | 'bezig' | 'v1' | 'laatste' | 'klaar'

/** Eén mail of post in de contentkalender van een klant. Ook zichtbaar in het portaal en in de Planning. */
export interface ContentItem {
  id: string
  /** Kanaal, bijv. Instagram, LinkedIn of Maillijst. */
  kanaal: string
  /** Onderwerp (mail) of titel (post). */
  titel: string
  /** Wanneer hij verstuurd of geplaatst wordt (YYYY-MM-DD). */
  datum?: string
  /** Tijdstip (HH:MM), optioneel. */
  tijd?: string
  status: ContentStatus
  /** Volledige tekst van de mail of de post. */
  inhoud?: string
  /** Link naar het ontwerp of de visual (Canva, Drive). */
  link?: string
  /** Geüploade visuals (opslag: content/<klant-id>/…, ook leesbaar voor de klant zelf). */
  visuals?: Bestand[]
  /** Alttekst van de visual (toegankelijkheid; plak je bij het plaatsen in het platform). */
  alttekst?: string
  updatedAt?: string
  by?: PersonId
}

/** Meta-attributievenster voor de commissie: wat telt als aankoop. */
export type CommissieVenster = '7d_click' | '1d_click' | '7d_click_1d_view'

export interface Hulpvraag {
  id: string
  tekst: string
  email?: string
  at: string
  afgehandeld?: boolean
  afgehandeldAt?: string
}

export interface ContentPlek {
  id: string
  title: string
  url: string
  /** Wie hem toevoegde: Rise (dashboard) of de klant (portaal). */
  door: 'rise' | 'klant'
  by?: PersonId
  email?: string
  at: string
}

export interface KlantTaak {
  id: string
  title: string
  description?: string
  /** Graag vóór deze datum (YYYY-MM-DD). */
  deadline?: string
  done: boolean
  doneAt?: string
  createdAt: string
  by?: PersonId
}

/** Fasen op het bord Productie (content voor klanten). */
export type ProductieFase = 'productie' | 'filmen' | 'edit1' | 'edit2' | 'feedback' | 'live'
/** Fasen op het bord Interne projecten. */
export type InternFase = 'gepland' | 'bezig' | 'doorlopend' | 'afgerond'
/** 'mail' en 'post' zijn geen projecten: die komen uit de contentkalender van de klant. */
export type ContentSoort = 'video' | 'static' | 'ugc' | 'script' | 'revisie' | 'mail' | 'post'

/**
 * Project: content in productie voor een klant (soort 'productie') of een eigen project van Rise (soort 'intern', bijv. SEO, Outreach).
 * Projecten zonder soort zijn interne projecten van vóór ronde 4.
 */
export interface Project {
  id: string
  name: string
  soort?: 'productie' | 'intern'
  /** Productie: voor welke klant. */
  clientId?: string
  fase?: ProductieFase | InternFase
  contentSoort?: ContentSoort
  priority?: Priority
  /** Bedrag (ex btw) van deze productie. */
  bedrag?: number
  /** Af vóór (YYYY-MM-DD). */
  deadline?: string
  /** Wie eraan werken. */
  wie?: PersonId[]
  /** Vrije notities op de projectpagina. */
  notities?: string
  bestanden?: Bestand[]
  links?: { id: string; title: string; url: string; at: string; by?: PersonId }[]
  description?: string
  /** Website voor de kaartafbeelding (bijv. risevideomarketing.nl). */
  website?: string
  logo?: string
  createdAt: string
  /** Updates, nieuwste eerst: wat is er gedaan, door wie, wanneer. */
  updates: ProjectUpdate[]
  /** Eigen traject van dit project (fasen en stappen); zonder: het sjabloon van de dienst of het standaardtraject. */
  phases?: Phase[]
  doneSteps?: string[]
  /** Huidige fase in het traject (index). */
  phase?: number
}

export interface ProjectUpdate {
  id: string
  /** Datum waarop het gedaan is (YYYY-MM-DD). */
  date: string
  /** Moment van plaatsen. */
  at: string
  author: PersonId
  text: string
  /** Ook tonen in het klantportaal (onder "Wat we voor je deden"). */
  klant?: boolean
}

/** Samenvatting van een productie voor het klantportaal (zonder bedragen of interne notities). Wordt automatisch bijgewerkt. */
export interface PortaalProductie {
  id: string
  name: string
  fase: ProductieFase
  contentSoort?: ContentSoort
  deadline?: string
  /** Updates die voor de klant zijn aangevinkt, nieuwste eerst (max. 5). */
  updates: { date: string; text: string }[]
}

export interface ClientLink {
  id: string
  title: string
  url: string
  klant: boolean
  at: string
  by?: PersonId
}

export interface PlanItem {
  id: string
  date: string
  title: string
}

export type InvoiceStatus = 'open' | 'betaald' | 'te laat'

export interface Invoice {
  id: string
  clientId: string
  number: string
  date: string
  amount: number
  status: InvoiceStatus
}

export interface Article {
  id: string
  category: string
  type: 'SOP' | 'Kennis'
  title: string
  summary: string
  updated: string
  author: PersonId
  steps?: string[]
  body: string[]
  videoUrl?: string
  /** Afbeeldingen in het artikel (bijv. slides uit Notion), uit public/img/kennisbank. */
  images?: { src: string; alt: string }[]
  /** Ook tonen in de kennisbank van het klantportaal. */
  klant?: boolean
  /** Alleen voor deze klanten (leeg = alle klanten). */
  klanten?: string[]
  /** Inhoud precies zoals in Notion (Notion-markdown met kolommen, toggles, callouts, tabbladen). */
  notion?: string
  /** Waar het in Notion stond, bijv. "Rise | Intern" of "Rise | Resources". */
  groep?: string
  /** Notion-afbeeldingen (bestandsnaam) → pad in de opslag. */
  afbeeldingen?: Record<string, string>
  icoon?: string
}

export interface MonthStat {
  month: string
  omzet: number
  kosten: number
  leads: number
  nieuweKlanten: number
}
