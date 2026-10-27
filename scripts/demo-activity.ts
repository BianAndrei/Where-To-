// Plays a week of realistic use through the running app's real API, so the
// admin activity log, security log and trip pages fill with genuine entries.
//   npm run dev                     (in another terminal)
//   npm run demo:activity           create 8 demo people and their activity
//   npm run db:seed -- --clean      remove every @demo.whereto.test account again
// Everything happens over HTTP exactly as a browser would do it. The script
// only touches the database to skip email: it marks addresses verified by
// building the same signed link the email contains, and reads one reset link.
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createEmailVerificationToken } from "better-auth/api";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";
import {
  defaultPreferences,
  freeTripState,
  newItem,
  parseReservationText,
  type TripItem,
  type TripState,
} from "@whereto/shared";
import { db } from "../apps/api/src/db";
import { catalogue } from "../apps/api/src/catalogue";

const DOMAIN = "@demo.whereto.test";
const APP_URL = process.env.APP_URL!;
const API = `http://127.0.0.1:${process.env.PORT || 3001}`;
if (
  process.env.NODE_ENV === "production" ||
  !["localhost", "127.0.0.1"].includes(new URL(APP_URL).hostname)
)
  throw new Error("Demo activity is for a local development app only.");

const devices = {
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  bot: "python-requests/2.32.3",
};
const day = (offset: number) =>
  new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const city = (name: string) => catalogue.find((c) => c.name === name)!;
const log = (message: string) => console.log(`  ${message}`);

class Person {
  cookies = new Map<string, string>();
  id = "";
  password = "Demo-" + randomUUID();
  constructor(
    public name: string,
    public email: string,
    public ip: string,
    public device: string,
  ) {}
  async request(path: string, body?: unknown, method?: string) {
    const isForm = body instanceof FormData;
    const response = await fetch(API + path, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      redirect: "manual",
      headers: {
        Origin: APP_URL,
        "User-Agent": this.device,
        // The API trusts one proxy hop; locally that's this header.
        "X-Forwarded-For": this.ip,
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(body === undefined || isForm
          ? {}
          : { "Content-Type": "application/json" }),
      },
      ...(body === undefined
        ? {}
        : { body: isForm ? body : JSON.stringify(body) }),
    });
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";");
      const name = pair!.slice(0, pair!.indexOf("="));
      const value = pair!.slice(pair!.indexOf("=") + 1);
      if (!value || attributes.some((a) => /max-age=0\b/i.test(a.trim())))
        this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }
  async ok(path: string, body?: unknown, method?: string) {
    const response = await this.request(path, body, method);
    if (response.status >= 400)
      throw new Error(
        `${this.name}: ${method ?? "POST"} ${path} → ${response.status} ${await response.text()}`,
      );
    return response.status === 302 ? null : response.json();
  }
  async signUp() {
    const result = await this.ok("/api/auth/sign-up/email", {
      name: this.name,
      email: this.email,
      password: this.password,
    });
    this.id = result.user.id;
  }
  // The same signed link the verification email contains.
  async verifyEmail() {
    const token = await createEmailVerificationToken(
      process.env.BETTER_AUTH_SECRET!,
      this.email,
    );
    await this.ok(`/api/auth/verify-email?token=${token}&callbackURL=/app`);
  }
  async signIn(password = this.password, rememberMe = true) {
    return this.request("/api/auth/sign-in/email", {
      email: this.email,
      password,
      rememberMe,
    });
  }
  async signOut() {
    await this.ok("/api/auth/sign-out", {});
    this.cookies.clear();
  }
}

class Trip {
  constructor(
    public owner: Person,
    public data: { id: string; version: number; state: TripState },
  ) {}
  static async create(
    owner: Person,
    destinations: string[],
    start: number,
    nights: number,
    budget: string,
  ) {
    const state = freeTripState({
      organizer: owner.name.split(" ")[0]!,
      destinations: destinations.map(city),
      startDate: day(start),
      endDate: day(start + nights),
      currency: "EUR",
      budget,
      modules: "both",
      participants: [{ id: "person1", name: owner.name.split(" ")[0]! }],
    });
    return new Trip(owner, await owner.ok("/api/v1/trips", state));
  }
  async refresh(as: Person) {
    this.data = await as.ok(`/api/v1/trips/${this.data.id}`);
  }
  async command(as: Person, command: Record<string, unknown>) {
    this.data = await as.ok(`/api/v1/trips/${this.data.id}/commands`, {
      version: this.data.version,
      command,
    });
  }
  item(fields: Partial<TripItem> & { price?: string; quantity?: string }) {
    const { price, quantity, ...rest } = fields;
    const item = { ...newItem(this.data.state, rest.day ?? null), ...rest };
    if (price)
      item.lines = [
        {
          id: randomUUID(),
          label: rest.title ?? "Cost",
          unit: quantity ? "ticket" : "group",
          price,
          quantity: quantity ?? "1",
          multiplier: "1",
          currency: "EUR",
          rate: "1",
          rateDate: day(0),
          status: rest.state === "booked" ? "confirmed" : "estimated",
        },
      ];
    return item;
  }
  async add(as: Person, fields: Parameters<Trip["item"]>[0]) {
    const item = this.item(fields);
    await this.command(as, { type: "item.save", item });
    return item;
  }
  // The planner's "import a confirmation" flow: text in, booked item out.
  async importBooking(
    as: Person,
    kind: "accommodation" | "transport" | "activity",
    text: string,
  ) {
    const { draft } = parseReservationText(text, kind, this.data.state);
    draft.reservation = {
      fingerprint: createHash("sha256").update(text).digest("hex"),
      reference: text.match(/reference:\s*(.+)/i)?.[1] ?? "",
      source: "text",
      importedAt: new Date().toISOString(),
    };
    const form = new FormData();
    form.append(
      "payload",
      JSON.stringify({
        version: this.data.version,
        command: { type: "item.save", item: draft },
        text,
      }),
    );
    this.data = await as.ok(
      `/api/v1/trips/${this.data.id}/planning/import`,
      form,
    );
    return draft;
  }
}

async function enrollAuthenticator(person: Person, path: string) {
  const setup = await person.ok(path, { password: person.password });
  const secret = new TextDecoder().decode(
    base32.decode(new URL(setup.totpURI).searchParams.get("secret")!),
  );
  const code = () => createOTP(secret).totp();
  await person.ok("/api/auth/two-factor/verify-totp", { code: await code() });
  return code;
}

async function main() {
  const health = await fetch(`${API}/api/v1/health`).catch(() => null);
  if (!health?.ok)
    throw new Error(
      `The API isn't running at ${API}. Start it with npm run dev.`,
    );
  if (await db.user.count({ where: { email: { startsWith: "sofia.vasile" } } }))
    throw new Error(
      "Demo activity already exists. Remove it first with: npm run db:seed -- --clean",
    );

  const sofia = new Person(
    "Sofia Vasile",
    `sofia.vasile${DOMAIN}`,
    "203.0.113.21",
    devices.mac,
  );
  const tudor = new Person(
    "Tudor Lazar",
    `tudor.lazar${DOMAIN}`,
    "203.0.113.34",
    devices.windows,
  );
  const bianca = new Person(
    "Bianca Moldovan",
    `bianca.moldovan${DOMAIN}`,
    "203.0.113.47",
    devices.mac,
  );
  const cristian = new Person(
    "Cristian Popa",
    `cristian.popa${DOMAIN}`,
    "203.0.113.58",
    devices.android,
  );
  const daria = new Person(
    "Daria Neagu",
    `daria.neagu${DOMAIN}`,
    "203.0.113.69",
    devices.iphone,
  );
  const victor = new Person(
    "Victor Rusu",
    `victor.rusu${DOMAIN}`,
    "203.0.113.80",
    devices.windows,
  );
  const larisa = new Person(
    "Larisa Toma",
    `larisa.toma${DOMAIN}`,
    "203.0.113.91",
    devices.android,
  );
  const staff = new Person(
    "Irina (Whereto support)",
    `support.irina${DOMAIN}`,
    "192.0.2.10",
    devices.mac,
  );
  const people = [sofia, tudor, bianca, cristian, daria, victor, larisa, staff];

  console.log("1. Sign-ups and email verification");
  for (const person of people) {
    await person.signUp();
    if (person !== larisa) await person.verifyEmail();
    log(
      `${person.name}${person === larisa ? " (never verified her email)" : ""}`,
    );
  }
  // Signing in before verifying just gets "verify your email first".
  await larisa.signIn();

  console.log("2. Sofia plans Lisbon & Porto, books, and invites Tudor");
  await sofia.signOut();
  await sofia.ok("/api/auth/sign-in/email", {
    email: sofia.email,
    password: sofia.password,
    rememberMe: true,
  });
  const lisbon = await Trip.create(sofia, ["Lisbon", "Porto"], 21, 6, "1800");
  await lisbon.command(sofia, {
    type: "settings",
    patch: { title: "Portugal with Tudor" },
  });
  await lisbon.command(sofia, {
    type: "participants",
    participants: [
      { id: "person1", name: "Sofia" },
      { id: "person2", name: "Tudor" },
    ],
    recalculate: false,
  });
  await lisbon.importBooking(
    sofia,
    "accommodation",
    `Hotel: Casa do Bairro, Lisbon\nCheck-in: ${day(21)} 15:00\nCheck-out: ${day(24)} 11:00\nTotal: EUR 412.00\nBooking reference: DEMO-LIS-4821`,
  );
  await lisbon.importBooking(
    sofia,
    "transport",
    `Train: Alfa Pendular Lisbon → Porto\nDeparture: ${day(24)} 09:39\nArrival: ${day(24)} 12:27\nTotal: EUR 62.40\nBooking reference: DEMO-CP-7710`,
  );
  await lisbon.importBooking(
    sofia,
    "accommodation",
    `Hotel: Ribeira Guesthouse, Porto\nCheck-in: ${day(24)} 14:00\nCheck-out: ${day(27)} 10:00\nTotal: EUR 336.00\nBooking reference: DEMO-OPO-1934`,
  );
  const belem = await lisbon.add(sofia, {
    title: "Belém Tower & Jerónimos tour",
    kind: "activity",
    category: "Activities",
    state: "booked",
    day: day(22),
    time: "10:00",
    duration: 180,
    price: "18.00",
    quantity: "2",
  });
  await lisbon.add(sofia, {
    title: "Dinner at Taberna da Rua das Flores",
    kind: "restaurant",
    category: "Food",
    state: "booked",
    day: day(22),
    time: "20:30",
    duration: 120,
    price: "70.00",
  });
  await lisbon.add(sofia, {
    title: "Fado night in Alfama",
    kind: "activity",
    category: "Activities",
    state: "planned",
    day: day(23),
    time: "21:00",
    duration: 150,
    price: "45.00",
  });
  const sintra = await lisbon.add(sofia, {
    title: "Sintra day trip?",
    kind: "activity",
    category: "Activities",
    state: "idea",
    day: null,
  });
  await lisbon.add(sofia, {
    title: "Port wine cellar tasting",
    kind: "activity",
    category: "Activities",
    state: "planned",
    day: day(25),
    time: "16:00",
    duration: 90,
    price: "25.00",
    quantity: "2",
  });
  await lisbon.command(sofia, {
    type: "checklist",
    checklist: [
      { id: randomUUID(), text: "Passports", done: true, group: "before" },
      {
        id: randomUUID(),
        text: "Travel insurance",
        done: false,
        group: "before",
      },
      {
        id: randomUUID(),
        text: "Walking shoes",
        done: false,
        group: "packing",
      },
    ],
  });
  const invite = await sofia.ok(`/api/v1/trips/${lisbon.data.id}/shares`, {
    role: "editor",
  });
  await sofia.ok(`/api/v1/trips/${lisbon.data.id}/shares`, {
    role: "viewer",
    showBudget: false,
  });
  log(
    "3 bookings imported, 5 activities and meals, a checklist, two share links",
  );

  console.log("3. Tudor joins Sofia's trip and plans Barcelona");
  await tudor.ok(`/api/v1/join/${invite.url.split("/join/")[1]}`, {});
  await lisbon.refresh(tudor);
  await lisbon.command(tudor, {
    type: "comment",
    itemId: belem.id,
    text: "Booked for 10:00 — let's grab pastéis de Belém after!",
  });
  await lisbon.add(tudor, {
    title: "LX Factory market",
    kind: "shopping",
    category: "Shopping",
    state: "planned",
    day: day(23),
    time: "11:00",
    duration: 120,
  });
  await lisbon.refresh(sofia);
  await lisbon.command(sofia, { type: "item.delete", id: sintra.id });
  const barcelona = await Trip.create(tudor, ["Barcelona"], 45, 4, "1200");
  await barcelona.importBooking(
    tudor,
    "activity",
    `Tour: Sagrada Família with towers\nDate: ${day(46)} 09:15\nTotal: EUR 72.00\nReference: DEMO-SF-5521`,
  );
  await barcelona.add(tudor, {
    title: "Tapas crawl in El Born",
    kind: "restaurant",
    category: "Food",
    state: "planned",
    day: day(46),
    time: "20:00",
    duration: 180,
    price: "60.00",
  });
  log("joined, commented, added an item; Sofia removed an idea");

  console.log("4. Bianca turns on two-factor and plans Rome");
  const biancaCode = await enrollAuthenticator(
    bianca,
    "/api/auth/two-factor/enable",
  );
  const rome = await Trip.create(bianca, ["Rome"], 30, 5, "1500");
  await rome.importBooking(
    bianca,
    "activity",
    `Tour: Vatican Museums & Sistine Chapel\nDate: ${day(31)} 08:30\nTotal: EUR 64.00\nBooking reference: DEMO-VAT-3307`,
  );
  await rome.add(bianca, {
    title: "Colosseum underground",
    kind: "activity",
    category: "Activities",
    state: "booked",
    day: day(32),
    time: "13:00",
    duration: 180,
    price: "52.00",
  });
  await bianca.signOut();
  // Later, from her phone: a wrong code, then the right one.
  const biancaPhone = new Person(
    bianca.name,
    bianca.email,
    "203.0.113.48",
    devices.iphone,
  );
  biancaPhone.password = bianca.password;
  await biancaPhone.signIn(bianca.password, false);
  await biancaPhone.request("/api/auth/two-factor/verify-totp", {
    code: "000000",
  });
  await biancaPhone.ok("/api/auth/two-factor/verify-totp", {
    code: await biancaCode(),
  });
  log("authenticator on, Vatican tour imported, signed in again with a code");

  console.log("5. Someone tries to guess Cristian's password");
  const vienna = await Trip.create(cristian, ["Vienna"], 60, 3, "900");
  await vienna.add(cristian, {
    title: "Schönbrunn Palace",
    kind: "activity",
    category: "Activities",
    state: "planned",
    day: day(61),
    time: "10:00",
    duration: 180,
    price: "29.00",
  });
  for (let i = 0; i < 11; i++) {
    const attacker = new Person(
      "attacker",
      cristian.email,
      `198.51.100.${60 + (i % 5)}`,
      devices.bot,
    );
    await attacker.signIn(`guess-${i}-Password1`);
  }
  const blocked = await cristian.signIn();
  await cristian.ok("/api/auth/request-password-reset", {
    email: cristian.email,
    redirectTo: "/reset-password",
  });
  const reset = await db.verification.findFirstOrThrow({
    where: {
      value: cristian.id,
      identifier: { startsWith: "reset-password:" },
    },
    orderBy: { createdAt: "desc" },
  });
  cristian.password = "Demo-reset-" + randomUUID();
  await cristian.ok("/api/auth/reset-password", {
    newPassword: cristian.password,
    token: reset.identifier.slice("reset-password:".length),
  });
  cristian.cookies.clear();
  await cristian.ok("/api/auth/sign-in/email", {
    email: cristian.email,
    password: cristian.password,
  });
  log(
    `10 wrong guesses from 5 addresses → locked (his own try got ${blocked.status}), then he reset his password`,
  );

  console.log(
    "6. Daria changes her password and settings, then archives a trip",
  );
  const amsterdam = await Trip.create(daria, ["Amsterdam"], 14, 3, "1000");
  await amsterdam.add(daria, {
    title: "Rijksmuseum",
    kind: "activity",
    category: "Activities",
    state: "booked",
    day: day(15),
    time: "09:00",
    duration: 180,
    price: "22.50",
  });
  await amsterdam.add(daria, {
    title: "Canal cruise",
    kind: "activity",
    category: "Activities",
    state: "planned",
    day: day(15),
    time: "17:00",
    duration: 75,
    price: "18.00",
  });
  await daria.ok(
    "/api/v1/me/preferences",
    { ...defaultPreferences, currency: "RON", departureCity: "Cluj-Napoca" },
    "PATCH",
  );
  const newPassword = "Demo-changed-" + randomUUID();
  await daria.ok("/api/auth/change-password", {
    currentPassword: daria.password,
    newPassword,
    revokeOtherSessions: true,
  });
  daria.password = newPassword;
  await daria.ok(`/api/v1/trips/${amsterdam.data.id}/archive`, {
    archived: true,
  });
  log("password changed, preferences saved, Amsterdam archived");

  console.log("7. Victor creates a trip and spreads share links");
  const athens = await Trip.create(victor, ["Athens"], 10, 2, "500");
  await athens.add(victor, {
    title: "FREE TOURS click bit.ly/xyz",
    kind: "other",
    category: "Other",
    state: "idea",
    day: null,
  });
  for (let i = 0; i < 3; i++)
    await victor.ok(`/api/v1/trips/${athens.data.id}/shares`, {
      role: "viewer",
    });
  log("3 public share links");

  console.log("8. Irina from support uses admin");
  await db.user.update({ where: { id: staff.id }, data: { role: "admin" } });
  await staff.signOut();
  await staff.ok("/api/auth/sign-in/email", {
    email: staff.email,
    password: staff.password,
  });
  const staffCode = await enrollAuthenticator(
    staff,
    "/api/v1/admin/access/enroll",
  );
  await staff.ok("/api/v1/admin/access/verify", { code: await staffCode() });
  const intervene = (
    action: string,
    target: string,
    reason: string,
    extra = {},
  ) =>
    staff.ok(`/api/v1/admin/actions/${action}/${target}`, {
      requestKey: randomUUID(),
      reason,
      ...extra,
    });
  await intervene(
    "grant",
    sofia.id,
    "Goodwill: her PDF export failed twice before departure.",
    { kind: "trip", quantity: 1 },
  );
  await intervene(
    "grant",
    bianca.id,
    "Menu imports for Rome restaurants failed; compensating.",
    { kind: "menu", quantity: 5 },
  );
  await intervene(
    "revoke-sessions",
    cristian.id,
    "Account was targeted by password guessing; signing out every device as a precaution.",
  );
  await intervene(
    "suspend",
    victor.id,
    "Trip and share links used to spread spam links. Suspended pending review.",
  );
  log("granted credits ×2, revoked Cristian's sessions, suspended Victor");

  if (process.env.DEMO_ADMIN_COOKIE_FILE)
    await writeFile(
      process.env.DEMO_ADMIN_COOKIE_FILE,
      JSON.stringify(
        [...staff.cookies].map(([name, value]) => ({ name, value })),
      ),
      { mode: 0o600 },
    );
  console.log(
    `\nDone: ${people.length} demo people (${DOMAIN}). Open /admin → Activity log and Sign-in & security.\nRemove everything with: npm run db:seed -- --clean`,
  );
}

await main().finally(() => db.$disconnect());
