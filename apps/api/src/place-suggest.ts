import { catalogue } from "./catalogue.js";

const landmarks = [
  "Grand Canyon",
  "Yellowstone",
  "Yosemite",
  "Niagara Falls",
  "Statue of Liberty",
  "Golden Gate Bridge",
  "Hollywood",
  "Disney World",
  "Eiffel Tower",
  "Louvre",
  "Mont Saint-Michel",
  "French Riviera",
  "Colosseum",
  "Vatican City",
  "Pompeii",
  "Amalfi Coast",
  "Cinque Terre",
  "Lake Como",
  "Dolomites",
  "Sagrada Familia",
  "Alhambra",
  "Ibiza",
  "Mallorca",
  "Santorini",
  "Mykonos",
  "Acropolis",
  "Big Ben",
  "Stonehenge",
  "Edinburgh Castle",
  "Loch Ness",
  "Cliffs of Moher",
  "Neuschwanstein Castle",
  "Black Forest",
  "Swiss Alps",
  "Matterhorn",
  "Hallstatt",
  "Prague Castle",
  "Charles Bridge",
  "Bran Castle",
  "Transfagarasan",
  "Delta Dunarii",
  "Plitvice Lakes",
  "Dubrovnik",
  "Hagia Sophia",
  "Cappadocia",
  "Pamukkale",
  "Petra",
  "Pyramids of Giza",
  "Victoria Falls",
  "Kilimanjaro",
  "Serengeti",
  "Table Mountain",
  "Machu Picchu",
  "Iguazu Falls",
  "Christ the Redeemer",
  "Galapagos Islands",
  "Patagonia",
  "Great Barrier Reef",
  "Uluru",
  "Sydney Opera House",
  "Milford Sound",
  "Taj Mahal",
  "Great Wall of China",
  "Forbidden City",
  "Angkor Wat",
  "Ha Long Bay",
  "Mount Fuji",
  "Bali",
  "Phuket",
  "Maldives",
  "Burj Khalifa",
  "Mount Everest",
  "Banff National Park",
  "Lake Bled",
  "Santorini",
  "Tenerife",
  "Madeira",
  "Azores",
  "Lofoten",
  "Northern Lights",
  "Reykjavik",
];
const usStates = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
  "Tuscany",
  "Sicily",
  "Sardinia",
  "Catalonia",
  "Andalusia",
  "Bavaria",
  "Provence",
  "Normandy",
  "Scotland",
  "Wales",
  "England",
  "Transylvania",
];
const countryNames = (() => {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    const out: string[] = [];
    for (let a = 65; a <= 90; a++)
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        const name = names.of(code);
        if (name && name !== code) out.push(name);
      }
    return out;
  } catch {
    return [];
  }
})();
const dictionary = [
  ...new Set([
    ...countryNames,
    ...usStates,
    ...landmarks,
    ...catalogue.map((p) => p.name),
  ]),
].map((name) => ({ name, key: normalise(name) }));

function normalise(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function distance(a: string, b: string, limit: number) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row: number[] = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        previous[j]! + 1,
        row[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    previous = row;
  }
  return previous[b.length]!;
}
/** Returns the closest well-known destination name to a probably misspelled query. */
export function suggestPlaceName(query: string) {
  const key = normalise(query);
  if (key.length < 3) return undefined;
  const limit = key.length <= 5 ? 1 : key.length <= 9 ? 2 : 3;
  let best: { name: string; score: number } | undefined;
  for (const entry of dictionary) {
    const score = distance(key, entry.key, limit);
    if (score <= limit && (!best || score < best.score))
      best = { name: entry.name, score };
  }
  return best && best.name.toLowerCase() !== query.trim().toLowerCase()
    ? best.name
    : undefined;
}
