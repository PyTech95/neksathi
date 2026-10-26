// Brand → model lists for the vehicle add/edit forms (Indian market, practical
// subset). The forms always add an "Other / not listed" escape so any brand or
// model can still be typed. Keep "Other" OUT of these arrays — the picker adds it.

export const VEHICLE_BRANDS = {
  // Cars
  "Maruti Suzuki": ["Alto", "S-Presso", "Celerio", "WagonR", "Swift", "Dzire", "Baleno", "Fronx", "Ignis", "Ciaz", "Ertiga", "XL6", "Brezza", "Grand Vitara", "Jimny", "Invicto"],
  "Hyundai": ["Grand i10 Nios", "i20", "Aura", "Exter", "Venue", "Verna", "Creta", "Alcazar", "Tucson", "Ioniq 5"],
  "Tata": ["Tiago", "Tigor", "Altroz", "Punch", "Nexon", "Curvv", "Harrier", "Safari"],
  "Mahindra": ["Bolero", "Bolero Neo", "Scorpio Classic", "Scorpio-N", "Thar", "Thar Roxx", "XUV300", "XUV400", "XUV700", "Marazzo"],
  "Toyota": ["Glanza", "Taisor", "Urban Cruiser Hyryder", "Rumion", "Innova Crysta", "Innova Hycross", "Fortuner", "Hilux", "Camry", "Vellfire"],
  "Honda": ["Amaze", "City", "Elevate"],
  "Kia": ["Sonet", "Syros", "Seltos", "Carens", "Carnival", "EV6"],
  "Renault": ["Kwid", "Triber", "Kiger"],
  "Volkswagen": ["Virtus", "Taigun", "Tiguan"],
  "Skoda": ["Slavia", "Kushaq", "Kodiaq"],
  "MG": ["Comet EV", "Astor", "Hector", "Gloster", "Windsor EV", "ZS EV"],
  "Nissan": ["Magnite"],
  "Citroen": ["C3", "C3 Aircross", "Basalt"],
  "Jeep": ["Compass", "Meridian", "Wrangler"],
  "Ford": ["EcoSport", "Figo", "Aspire", "Endeavour"],
  // Two-wheelers
  "Hero": ["Splendor Plus", "HF Deluxe", "Passion", "Glamour", "Super Splendor", "Xtreme 125R", "Xtreme 160R", "Xpulse 200", "Destini 125", "Pleasure+"],
  "Honda 2W": ["Activa", "Dio", "Shine", "SP 125", "Unicorn", "Hornet 2.0", "CB350", "Activa Electric"],
  "Bajaj": ["Platina", "CT 100", "CT 125X", "Pulsar 125", "Pulsar 150", "Pulsar N160", "Pulsar NS200", "Avenger", "Dominar", "Chetak"],
  "TVS": ["Sport", "Star City+", "Radeon", "Raider 125", "Apache RTR 160", "Apache RTR 200", "Ntorq 125", "Jupiter", "Jupiter 125", "iQube"],
  "Royal Enfield": ["Hunter 350", "Classic 350", "Bullet 350", "Meteor 350", "Himalayan", "Continental GT 650", "Interceptor 650"],
  "Yamaha": ["FZ", "FZ-S", "R15", "MT-15", "Fascino 125", "RayZR 125", "Aerox 155"],
  "Suzuki 2W": ["Access 125", "Burgman Street", "Avenis", "Gixxer", "Gixxer SF"],
  "Ola Electric": ["S1 X", "S1 Air", "S1 Pro", "S1 Gig"],
  "Ather": ["450S", "450X", "Rizta"],
  "TVS Electric": ["iQube", "iQube ST", "X"],
  // Tractors
  "Mahindra Tractor": ["JIVO 245", "275 DI", "475 DI", "575 DI", "Yuvo 575", "Arjun Novo", "OJA"],
  "Swaraj": ["735 FE", "744 FE", "855 FE", "963 FE"],
  "Sonalika": ["DI 35", "DI 745", "DI 750", "Sikander DI 60"],
  "John Deere": ["5050 D", "5105", "5310", "5405"],
  "New Holland": ["3230", "3600", "Excel 4710"],
  "Eicher Tractor": ["380", "480", "557", "650"],
  // Commercial
  "Tata Commercial": ["Ace", "Ace EV", "Intra V30", "Intra V50", "407", "709", "LPT 1109"],
  "Ashok Leyland": ["Dost", "Bada Dost", "Partner", "Ecomet"],
  "Mahindra Commercial": ["Jeeto", "Supro", "Bolero Pik-Up", "Furio"],
  "Eicher Commercial": ["Pro 2049", "Pro 2059", "Pro 3015"],
};

// 12 common vehicle colours.
export const VEHICLE_COLORS = [
  "White", "Silver", "Grey", "Black", "Red", "Blue",
  "Brown", "Green", "Yellow", "Orange", "Maroon", "Golden",
];

// Vehicle type options used across the forms.
export const VEHICLE_TYPES = [
  { value: "car", label: "Car" },
  { value: "bike", label: "Two-wheeler / Bike" },
  { value: "tractor", label: "Tractor" },
  { value: "commercial", label: "Commercial / Truck" },
  { value: "other", label: "Other" },
];
