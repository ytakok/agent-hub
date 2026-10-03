import { Injectable } from '@nestjs/common';
import { base, en, Faker, he } from '@faker-js/faker';
import type { Customer, Lead, LeadStage, Locale, Message, Policy, PolicyType, SheetRecord } from '@agency-hub/shared';

export interface TenantDataset {
  customers: Customer[];
  leads: Lead[];
  policies: Policy[];
  emails: Message[];
  whatsapp: Message[];
  sheet: { sheetName: string; columns: string[]; rows: SheetRecord[] };
}

const DAY = 86_400_000;
const BUCKET = 10 * 60_000;
const STAGES: LeadStage[] = ['new', 'contacted', 'quoted', 'negotiation', 'won', 'lost'];
const POLICY_TYPES: PolicyType[] = ['car', 'home', 'life', 'health', 'business', 'travel'];

const TEXT = {
  he: {
    carriers: ['הראל', 'מגדל', 'כלל', 'הפניקס', 'מנורה', 'איילון'],
    leadSources: ['אתר', 'פייסבוק', 'הפניה', 'גוגל', 'וואטסאפ'],
    sheetName: 'לידים מהאתר',
    columns: ['שם', 'טלפון', 'מוצר', 'הערות'],
    notes: ['לחזור אחרי 16:00', 'מעוניין בהצעה משולבת', 'יש פוליסה בחברה אחרת', 'דחוף'],
    products: { car: 'ביטוח רכב', home: 'ביטוח דירה', life: 'ביטוח חיים', health: 'ביטוח בריאות', business: 'ביטוח עסק', travel: 'ביטוח נסיעות' },
    subjects: ['בקשה לחידוש פוליסה', 'שאלה לגבי תביעה', 'עדכון פרטי רכב', 'בקשה להצעת מחיר', 'אישור קבלת מסמכים', 'שינוי אמצעי תשלום'],
    snippets: [
      'שלום, רציתי לברר מתי מסתיימת הפוליסה שלי ומה העלות לחידוש.',
      'מצרף צילום של רישיון הרכב החדש, אשמח לעדכון.',
      'האם אפשר לקבל הצעה לביטוח דירה כולל תכולה?',
      'עדיין לא קיבלתי תשובה לגבי התביעה מהחודש שעבר.',
      'אפשר לשוחח היום אחרי הצהריים?',
      'קיבלתי חיוב כפול החודש, אפשר לבדוק?',
    ],
  },
  en: {
    carriers: ['Harel', 'Migdal', 'Clal', 'Phoenix', 'Menora', 'Ayalon'],
    leadSources: ['Website', 'Facebook', 'Referral', 'Google', 'WhatsApp'],
    sheetName: 'Website leads',
    columns: ['Name', 'Phone', 'Product', 'Notes'],
    notes: ['Call back after 4pm', 'Wants a bundle quote', 'Has a policy elsewhere', 'Urgent'],
    products: { car: 'Car insurance', home: 'Home insurance', life: 'Life insurance', health: 'Health insurance', business: 'Business insurance', travel: 'Travel insurance' },
    subjects: ['Policy renewal request', 'Question about my claim', 'Vehicle details update', 'Quote request', 'Documents received?', 'Change payment method'],
    snippets: [
      'Hi, when does my policy end and what will the renewal cost?',
      'Attaching the new vehicle registration, please update.',
      'Can I get a home insurance quote including contents?',
      'Still waiting to hear back about last month\'s claim.',
      'Can we talk this afternoon?',
      'I was charged twice this month, can you check?',
    ],
  },
} as const;

/**
 * Generates one consistent, deterministic dataset per tenant + locale (stable across restarts within a day),
 * so all mock providers reference the same customers.
 */
@Injectable()
export class MockDatasetService {
  private readonly cache = new Map<string, TenantDataset>();

  get(tenantId: string, locale: Locale): TenantDataset {
    // Regenerated every 10 minutes so relative times ("5 min ago") stay realistic, yet stable between requests.
    const bucket = Math.floor(Date.now() / BUCKET) * BUCKET;
    const key = `${tenantId}:${locale}:${bucket}`;
    let ds = this.cache.get(key);
    if (!ds) {
      if (this.cache.size > 50) this.cache.clear();
      ds = generate(tenantId, locale, bucket);
      this.cache.set(key, ds);
    }
    return ds;
  }
}

function generate(tenantId: string, locale: Locale, now: number): TenantDataset {
  const f = new Faker({ locale: locale === 'he' ? [he, en, base] : [en, base] });
  const fEn = new Faker({ locale: [en, base] });
  const seed = hash(tenantId);
  f.seed(seed);
  fEn.seed(seed);
  const t = TEXT[locale];
  const today = Math.floor(now / DAY) * DAY;
  const ago = (maxDays: number) => new Date(now - f.number.int({ min: 0, max: maxDays * DAY })).toISOString();

  const customers: Customer[] = Array.from({ length: 60 }, (_, i) => {
    const first = fEn.person.firstName();
    const last = fEn.person.lastName();
    return {
      id: `cus_${i + 1}`,
      fullName: locale === 'he' ? f.person.fullName() : `${first} ${last}`,
      emails: [fEn.internet.email({ firstName: first, lastName: last }).toLowerCase()],
      phones: [`+9725${f.string.numeric(8)}`],
      whatsappId: f.datatype.boolean(0.7) ? `9725${f.string.numeric(8)}` : undefined,
      city: f.location.city(),
      tags: f.helpers.arrayElements(['VIP', 'family', 'business', 'new'], { min: 0, max: 2 }),
      status: f.helpers.weightedArrayElement([
        { weight: 7, value: 'active' as const },
        { weight: 2, value: 'lead' as const },
        { weight: 1, value: 'churned' as const },
      ]),
      source: f.helpers.arrayElement(['crm', 'sheets', 'whatsapp', 'manual'] as const),
      lastContactAt: ago(60),
      createdAt: ago(900),
    };
  });

  const leads: Lead[] = Array.from({ length: 45 }, (_, i) => ({
    id: `lead_${i + 1}`,
    name: f.person.fullName(),
    phone: `+9725${f.string.numeric(8)}`,
    source: f.helpers.arrayElement(t.leadSources),
    productInterest: f.helpers.arrayElement(POLICY_TYPES),
    stage: f.helpers.weightedArrayElement(STAGES.map((value, idx) => ({ value, weight: [8, 6, 5, 3, 2, 2][idx] }))),
    value: f.number.int({ min: 1200, max: 25000 }),
    createdAt: ago(90),
  })).sort(byDateDesc('createdAt'));

  const policies: Policy[] = customers.flatMap((c, i) =>
    Array.from({ length: f.number.int({ min: 1, max: 2 }) }, (_, j) => {
      const start = today - f.number.int({ min: 200, max: 700 }) * DAY;
      const renewal = today + f.number.int({ min: -10, max: 120 }) * DAY;
      const daysLeft = (renewal - today) / DAY;
      return {
        id: `pol_${i + 1}_${j + 1}`,
        customerId: c.id,
        customerName: c.fullName,
        type: f.helpers.arrayElement(POLICY_TYPES),
        carrier: f.helpers.arrayElement(t.carriers),
        policyNumber: f.string.numeric(9),
        premium: f.number.int({ min: 900, max: 14000 }),
        currency: 'ILS',
        startDate: new Date(start).toISOString(),
        endDate: new Date(renewal).toISOString(),
        renewalDate: new Date(renewal).toISOString(),
        status: daysLeft < 0 ? 'expired' : daysLeft <= 30 ? 'pending_renewal' : 'active',
      } satisfies Policy;
    }),
  );

  const message = (channel: Message['channel'], i: number): Message => {
    const c = f.helpers.arrayElement(customers);
    const receivedAt = new Date(now - f.number.int({ min: 5, max: 72 * 60 }) * 60_000);
    const status = f.helpers.weightedArrayElement([
      { weight: 5, value: 'new' as const },
      { weight: 3, value: 'assigned' as const },
      { weight: 2, value: 'replied' as const },
    ]);
    return {
      id: `${channel === 'gmail' ? 'gm' : 'wa'}_${i + 1}`,
      channel,
      direction: 'in',
      customerId: c.id,
      fromName: c.fullName,
      from: channel === 'gmail' ? c.emails[0]! : c.phones[0]!,
      subject: channel === 'gmail' ? f.helpers.arrayElement(t.subjects) : undefined,
      snippet: f.helpers.arrayElement(t.snippets),
      status,
      receivedAt: receivedAt.toISOString(),
      slaDueAt: new Date(receivedAt.getTime() + 4 * 3_600_000).toISOString(),
    };
  };
  const emails = Array.from({ length: 25 }, (_, i) => message('gmail', i)).sort(byDateDesc('receivedAt'));
  const whatsapp = Array.from({ length: 30 }, (_, i) => message('whatsapp', i)).sort(byDateDesc('receivedAt'));

  const rows: SheetRecord[] = Array.from({ length: 40 }, (_, i) => {
    const product = f.helpers.arrayElement(POLICY_TYPES);
    const [name, phone, prod, notes] = t.columns;
    return {
      id: `row_${i + 2}`,
      sheetName: t.sheetName,
      rowNumber: i + 2,
      data: {
        [name!]: f.person.fullName(),
        [phone!]: `05${f.string.numeric(1)}-${f.string.numeric(7)}`,
        [prod!]: t.products[product],
        [notes!]: f.helpers.arrayElement(t.notes),
      },
      syncedAt: ago(14),
    };
  }).sort(byDateDesc('syncedAt'));

  return { customers, leads, policies, emails, whatsapp, sheet: { sheetName: t.sheetName, columns: [...t.columns], rows } };
}

function byDateDesc<K extends string>(key: K) {
  return (a: Record<K, string>, b: Record<K, string>) => b[key].localeCompare(a[key]);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
