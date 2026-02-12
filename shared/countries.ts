export interface Country {
  code: string;
  name: string;
  cities: string[];
}

export const countries: Country[] = [
  {
    code: "AE",
    name: "United Arab Emirates",
    cities: ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah", "Fujairah", "Al Ain"],
  },
  {
    code: "US",
    name: "United States",
    cities: ["New York", "Los Angeles", "Chicago", "Houston", "Phoenix", "Philadelphia", "San Antonio", "San Diego", "Dallas", "San Francisco", "Miami", "Boston", "Seattle", "Denver", "Atlanta"],
  },
  {
    code: "GB",
    name: "United Kingdom",
    cities: ["London", "Manchester", "Birmingham", "Glasgow", "Liverpool", "Edinburgh", "Bristol", "Leeds", "Sheffield", "Newcastle"],
  },
  {
    code: "AU",
    name: "Australia",
    cities: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast", "Canberra", "Newcastle", "Hobart"],
  },
  {
    code: "CA",
    name: "Canada",
    cities: ["Toronto", "Vancouver", "Montreal", "Calgary", "Edmonton", "Ottawa", "Winnipeg", "Quebec City", "Hamilton"],
  },
  {
    code: "FR",
    name: "France",
    cities: ["Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Strasbourg", "Montpellier", "Bordeaux"],
  },
  {
    code: "DE",
    name: "Germany",
    cities: ["Berlin", "Munich", "Frankfurt", "Hamburg", "Cologne", "Stuttgart", "Dusseldorf", "Leipzig", "Dresden"],
  },
  {
    code: "ES",
    name: "Spain",
    cities: ["Madrid", "Barcelona", "Valencia", "Seville", "Zaragoza", "Malaga", "Murcia", "Bilbao", "Palma"],
  },
  {
    code: "IT",
    name: "Italy",
    cities: ["Rome", "Milan", "Naples", "Turin", "Florence", "Venice", "Bologna", "Genoa", "Palermo"],
  },
  {
    code: "JP",
    name: "Japan",
    cities: ["Tokyo", "Osaka", "Yokohama", "Nagoya", "Sapporo", "Kobe", "Kyoto", "Fukuoka", "Hiroshima"],
  },
  {
    code: "KR",
    name: "South Korea",
    cities: ["Seoul", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju", "Ulsan", "Suwon"],
  },
  {
    code: "CN",
    name: "China",
    cities: ["Beijing", "Shanghai", "Guangzhou", "Shenzhen", "Chengdu", "Hangzhou", "Wuhan", "Xi'an", "Nanjing"],
  },
  {
    code: "IN",
    name: "India",
    cities: ["Mumbai", "Delhi", "Bangalore", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad", "Jaipur"],
  },
  {
    code: "BR",
    name: "Brazil",
    cities: ["Sao Paulo", "Rio de Janeiro", "Brasilia", "Salvador", "Fortaleza", "Belo Horizonte", "Curitiba", "Recife"],
  },
  {
    code: "MX",
    name: "Mexico",
    cities: ["Mexico City", "Guadalajara", "Monterrey", "Puebla", "Tijuana", "Cancun", "Merida", "Queretaro"],
  },
  {
    code: "SA",
    name: "Saudi Arabia",
    cities: ["Riyadh", "Jeddah", "Mecca", "Medina", "Dammam", "Khobar", "Dhahran"],
  },
  {
    code: "QA",
    name: "Qatar",
    cities: ["Doha", "Al Wakrah", "Al Khor", "Al Rayyan", "Umm Salal"],
  },
  {
    code: "KW",
    name: "Kuwait",
    cities: ["Kuwait City", "Hawalli", "Salmiya", "Farwaniya", "Jahra"],
  },
  {
    code: "BH",
    name: "Bahrain",
    cities: ["Manama", "Riffa", "Muharraq", "Hamad Town", "Isa Town"],
  },
  {
    code: "OM",
    name: "Oman",
    cities: ["Muscat", "Salalah", "Sohar", "Nizwa", "Sur"],
  },
  {
    code: "EG",
    name: "Egypt",
    cities: ["Cairo", "Alexandria", "Giza", "Sharm El Sheikh", "Luxor", "Aswan", "Hurghada"],
  },
  {
    code: "ZA",
    name: "South Africa",
    cities: ["Johannesburg", "Cape Town", "Durban", "Pretoria", "Port Elizabeth"],
  },
  {
    code: "SG",
    name: "Singapore",
    cities: ["Singapore"],
  },
  {
    code: "MY",
    name: "Malaysia",
    cities: ["Kuala Lumpur", "George Town", "Johor Bahru", "Ipoh", "Kuching", "Kota Kinabalu"],
  },
  {
    code: "TH",
    name: "Thailand",
    cities: ["Bangkok", "Chiang Mai", "Phuket", "Pattaya", "Hat Yai", "Khon Kaen"],
  },
  {
    code: "ID",
    name: "Indonesia",
    cities: ["Jakarta", "Surabaya", "Bandung", "Medan", "Bali", "Semarang", "Yogyakarta"],
  },
  {
    code: "PH",
    name: "Philippines",
    cities: ["Manila", "Quezon City", "Davao", "Cebu", "Makati"],
  },
  {
    code: "VN",
    name: "Vietnam",
    cities: ["Ho Chi Minh City", "Hanoi", "Da Nang", "Hai Phong", "Can Tho"],
  },
  {
    code: "NZ",
    name: "New Zealand",
    cities: ["Auckland", "Wellington", "Christchurch", "Hamilton", "Tauranga", "Dunedin"],
  },
  {
    code: "IE",
    name: "Ireland",
    cities: ["Dublin", "Cork", "Limerick", "Galway", "Waterford"],
  },
  {
    code: "NL",
    name: "Netherlands",
    cities: ["Amsterdam", "Rotterdam", "The Hague", "Utrecht", "Eindhoven"],
  },
  {
    code: "BE",
    name: "Belgium",
    cities: ["Brussels", "Antwerp", "Ghent", "Bruges", "Liege"],
  },
  {
    code: "CH",
    name: "Switzerland",
    cities: ["Zurich", "Geneva", "Basel", "Lausanne", "Bern"],
  },
  {
    code: "AT",
    name: "Austria",
    cities: ["Vienna", "Salzburg", "Innsbruck", "Graz", "Linz"],
  },
  {
    code: "SE",
    name: "Sweden",
    cities: ["Stockholm", "Gothenburg", "Malmo", "Uppsala", "Vasteras"],
  },
  {
    code: "NO",
    name: "Norway",
    cities: ["Oslo", "Bergen", "Trondheim", "Stavanger", "Drammen"],
  },
  {
    code: "DK",
    name: "Denmark",
    cities: ["Copenhagen", "Aarhus", "Odense", "Aalborg"],
  },
  {
    code: "FI",
    name: "Finland",
    cities: ["Helsinki", "Espoo", "Tampere", "Vantaa", "Oulu"],
  },
  {
    code: "PL",
    name: "Poland",
    cities: ["Warsaw", "Krakow", "Lodz", "Wroclaw", "Poznan", "Gdansk"],
  },
  {
    code: "CZ",
    name: "Czech Republic",
    cities: ["Prague", "Brno", "Ostrava", "Plzen"],
  },
  {
    code: "PT",
    name: "Portugal",
    cities: ["Lisbon", "Porto", "Braga", "Coimbra", "Faro"],
  },
  {
    code: "GR",
    name: "Greece",
    cities: ["Athens", "Thessaloniki", "Patras", "Heraklion"],
  },
  {
    code: "TR",
    name: "Turkey",
    cities: ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya"],
  },
  {
    code: "IL",
    name: "Israel",
    cities: ["Tel Aviv", "Jerusalem", "Haifa", "Rishon LeZion", "Petah Tikva"],
  },
  {
    code: "JO",
    name: "Jordan",
    cities: ["Amman", "Zarqa", "Irbid", "Aqaba"],
  },
  {
    code: "LB",
    name: "Lebanon",
    cities: ["Beirut", "Tripoli", "Sidon", "Tyre"],
  },
  {
    code: "AR",
    name: "Argentina",
    cities: ["Buenos Aires", "Cordoba", "Rosario", "Mendoza", "Mar del Plata"],
  },
  {
    code: "CL",
    name: "Chile",
    cities: ["Santiago", "Valparaiso", "Concepcion", "La Serena"],
  },
  {
    code: "CO",
    name: "Colombia",
    cities: ["Bogota", "Medellin", "Cali", "Barranquilla", "Cartagena"],
  },
  {
    code: "PE",
    name: "Peru",
    cities: ["Lima", "Arequipa", "Trujillo", "Cusco"],
  },
  {
    code: "RU",
    name: "Russia",
    cities: ["Moscow", "Saint Petersburg", "Novosibirsk", "Yekaterinburg", "Kazan"],
  },
  {
    code: "UA",
    name: "Ukraine",
    cities: ["Kyiv", "Kharkiv", "Odesa", "Dnipro", "Lviv"],
  },
  {
    code: "RO",
    name: "Romania",
    cities: ["Bucharest", "Cluj-Napoca", "Timisoara", "Iasi", "Constanta"],
  },
  {
    code: "HU",
    name: "Hungary",
    cities: ["Budapest", "Debrecen", "Szeged", "Miskolc", "Pecs"],
  },
];

export function getCountryByCode(code: string): Country | undefined {
  return countries.find(c => c.code === code);
}

export function getCountryByName(name: string): Country | undefined {
  return countries.find(c => c.name.toLowerCase() === name.toLowerCase());
}

export function getCitiesForCountry(countryCode: string): string[] {
  const country = getCountryByCode(countryCode);
  return country?.cities || [];
}

export const countryToCurrency: Record<string, string> = {
  AE: "AED", US: "USD", GB: "GBP", AU: "AUD", CA: "CAD",
  FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", JP: "JPY",
  KR: "KRW", CN: "CNY", IN: "INR", BR: "BRL", MX: "MXN",
  SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR",
  EG: "EGP", ZA: "ZAR", SG: "SGD", MY: "MYR", TH: "THB",
  ID: "IDR", PH: "PHP", VN: "VND", NZ: "NZD", IE: "EUR",
  NL: "EUR", BE: "EUR", CH: "CHF", AT: "EUR", SE: "SEK",
  NO: "NOK", DK: "DKK", FI: "EUR", PL: "PLN", CZ: "CZK",
  PT: "EUR", GR: "EUR", TR: "TRY", IL: "ILS", JO: "JOD",
  LB: "LBP", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  RU: "RUB", UA: "UAH", RO: "RON", HU: "HUF",
};

export function getCurrencyForCountry(countryCode: string): string {
  return countryToCurrency[countryCode] || "USD";
}
