// Generates a rich demo dataset (120+ items) and applies it to the local D1.
// Run with: pnpm db:seed
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const PBKDF2_ITERATIONS = 120_000;
const enc = new TextEncoder();
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hashPassword(password) {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
		key,
		256
	);
	return { hash: toHex(bits), salt: toHex(salt) };
}

const q = (v) => {
	if (v === null || v === undefined) return 'NULL';
	if (typeof v === 'number') return String(v);
	if (typeof v === 'boolean') return v ? '1' : '0';
	return `'${String(v).replace(/'/g, "''")}'`;
};

const sql = [];
const now = 1_768_000_000; // fixed base timestamp (deterministic)

// ---- Reset (cascades wipe everything under the restaurant) ----
sql.push('PRAGMA foreign_keys = ON;');
sql.push('DELETE FROM restaurants WHERE id = 1;');

// ---- Restaurant ----
sql.push(`INSERT INTO restaurants
	(id, name, slug, base_code, base_symbol, base_precision, base_symbol_position,
	 settings_revision, multi_currency_enabled, conversion_mode,
	 beverage_prompt_enabled, beverage_prompt_heading, beverage_prompt_body, beverage_prompt_skip_label,
	 app_origin, next_order_seq, created_at, updated_at)
	VALUES (1, ${q('Varu Reef Kitchen')}, ${q('varu-reef')}, ${q('MVR')}, ${q('Rf')}, 2, ${q('after')},
	 1, 1, ${q('api')},
	 1, ${q('One more thing — anything to drink?')}, ${q('A cold drink or fresh juice pairs perfectly with your order. Add one before it heads to the kitchen.')}, ${q('No thanks, send order')},
	 NULL, 1, ${now}, ${now});`);

// ---- Display currencies (rate = units of currency per 1 MVR) ----
// 1 USD ≈ 15.4 MVR  => USD per MVR ≈ 0.0649
const currencies = [
	{ id: 1, code: 'USD', symbol: '$', precision: 2, pos: 'before', order: 1, mode: 'api', fixed: null, fallback: 0.0649 },
	{ id: 2, code: 'EUR', symbol: '€', precision: 2, pos: 'before', order: 2, mode: 'api', fixed: null, fallback: 0.06 },
	{ id: 3, code: 'GBP', symbol: '£', precision: 2, pos: 'before', order: 3, mode: 'api', fixed: null, fallback: 0.051 },
	{ id: 4, code: 'INR', symbol: '₹', precision: 2, pos: 'before', order: 4, mode: 'api', fixed: null, fallback: 5.42 },
	{ id: 5, code: 'AED', symbol: 'AED', precision: 2, pos: 'after', order: 5, mode: 'fixed', fixed: 0.238, fallback: 0.238 }
];
for (const c of currencies) {
	sql.push(`INSERT INTO currencies (id, restaurant_id, code, symbol, precision, symbol_position, display_order, enabled, mode, fixed_rate, fallback_rate)
		VALUES (${c.id}, 1, ${q(c.code)}, ${q(c.symbol)}, ${c.precision}, ${q(c.pos)}, ${c.order}, 1, ${q(c.mode)}, ${q(c.fixed)}, ${c.fallback});`);
}
// Seed the rate cache so the dev environment shows "fresh" attribution without
// network. Timestamp is relative to the real clock so it stays inside the 24h
// fresh window.
const realNow = Math.floor(Date.now() / 1000);
const freshRates = { USD: 0.0648, EUR: 0.0601, GBP: 0.0509, INR: 5.4 };
for (const [code, rate] of Object.entries(freshRates)) {
	sql.push(`INSERT INTO rate_cache (restaurant_id, code, base_code, rate, provider, fetched_at)
		VALUES (1, ${q(code)}, ${q('MVR')}, ${rate}, ${q('open.er-api.com')}, ${realNow - 3600});`);
}

// ---- Categories ----
const categoryDefs = [
	['Starters', 'Small plates to begin'],
	['Reef Salads', 'Crisp, bright, island-fresh'],
	['Soups', 'Slow-simmered comfort'],
	['From the Reef', 'The daily catch, cooked simply'],
	['The Grill', 'Charcoal-fired favourites'],
	['Island Curries', 'Fragrant Maldivian & South Asian curries'],
	['Rice & Noodles', 'Wok and pot classics'],
	['Flatbreads & Roshi', 'Fresh from the tandoor'],
	['Burgers & Sandwiches', 'Handhelds done right'],
	['Wood-Fired Pizza', 'Thin, blistered, generous'],
	['Pasta', 'Comforting bowls'],
	['Sides', 'The supporting cast'],
	['Desserts', 'A sweet finish'],
	['Hot Drinks', 'Coffee, tea & more'],
	['Cold Drinks', 'Chilled & fizzy'],
	['Fresh Juices', 'Pressed to order'],
	['Smoothies', 'Thick & tropical'],
	['Water', 'Still & sparkling']
];
const categories = categoryDefs.map(([name, desc], i) => ({ id: i + 1, name, desc }));
categories.forEach((c, i) => {
	sql.push(`INSERT INTO categories (id, restaurant_id, name, description, display_order, enabled, created_at)
		VALUES (${c.id}, 1, ${q(c.name)}, ${q(c.desc)}, ${i + 1}, 1, ${now});`);
});
const cat = (name) => categories.find((c) => c.name === name).id;

// ---- Option group templates ----
// choices: [name, priceAdj(minor, base MVR *100), isDefault]
const groupTemplates = {
	SIZE: { name: 'Size', type: 'single', required: 1, min: 1, max: 1, none: 0,
		choices: [['Regular', 0, 0], ['Large', 2500, 0]] },
	FRIES_SIZE: { name: 'Portion', type: 'single', required: 1, min: 1, max: 1, none: 0,
		choices: [['Regular', 0, 1], ['Sharing', 3000, 0]] },
	DONENESS: { name: 'Cooked to', type: 'single', required: 1, min: 1, max: 1, none: 0,
		choices: [['Medium rare', 0, 0], ['Medium', 0, 1], ['Well done', 0, 0]] },
	BURGER_ADDONS: { name: 'Add extras', type: 'multiple', required: 0, min: 0, max: 4, none: 1,
		choices: [['Smoked bacon', 2000, 0], ['Extra cheese', 1500, 0], ['Avocado', 2500, 0], ['Fried egg', 1500, 0]] },
	PIZZA_TOPPINGS: { name: 'Extra toppings', type: 'multiple', required: 0, min: 0, max: 5, none: 1,
		choices: [['Buffalo mozzarella', 3000, 0], ['Reef prawns', 4500, 0], ['Rocket & parmesan', 2500, 0], ['Chilli honey', 1500, 0], ['Truffle oil', 3500, 0]] },
	SPICE: { name: 'Spice level', type: 'single', required: 1, min: 1, max: 1, none: 0,
		choices: [['Mild', 0, 0], ['Medium', 0, 1], ['Island hot', 0, 0]] },
	MILK: { name: 'Milk', type: 'single', required: 1, min: 1, max: 1, none: 0,
		choices: [['Whole milk', 0, 1], ['Skim milk', 0, 0], ['Oat milk', 1000, 0], ['Soy milk', 1000, 0], ['Almond milk', 1000, 0]] },
	COFFEE_EXTRAS: { name: 'Extras', type: 'multiple', required: 0, min: 0, max: 3, none: 1,
		choices: [['Extra shot', 1200, 0], ['Vanilla syrup', 1000, 0], ['Caramel syrup', 1000, 0], ['Decaf', 0, 0]] },
	SALAD_PROTEIN: { name: 'Add protein', type: 'single', required: 0, min: 0, max: 1, none: 1,
		choices: [['Grilled chicken', 4500, 0], ['Reef prawns', 6000, 0], ['Marinated tofu', 3500, 0]] },
	SUGAR: { name: 'Sweetness', type: 'single', required: 1, min: 1, max: 1, none: 0,
		choices: [['No sugar', 0, 0], ['Less sweet', 0, 0], ['Normal', 0, 1]] }
};

let itemId = 0;
let groupId = 1000;
let choiceId = 10000;
const items = [];

function addItem(def) {
	itemId += 1;
	const item = {
		id: itemId,
		categoryId: cat(def.category),
		name: def.name,
		description: def.description,
		price: def.price, // minor units MVR
		imageSeed: def.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
		availability: def.availability ?? 'available',
		enabled: def.enabled ?? 1,
		listed: def.listed === false ? 0 : 1,
		allergens: def.allergens ?? [],
		dietary: def.dietary ?? [],
		tags: def.tags ?? [],
		label: def.label ?? null,
		labelKind: def.labelKind ?? 'info',
		isBeverage: def.beverage ? 1 : 0,
		options: def.options ?? [],
		suggests: def.suggests ?? []
	};
	items.push(item);
	return item;
}

// Helper to build category items concisely
const A = { gluten: 'gluten', dairy: 'dairy', eggs: 'eggs', nuts: 'tree nuts', peanuts: 'peanuts', soy: 'soy', fish: 'fish', shellfish: 'shellfish', sesame: 'sesame' };
const D = { veg: 'vegetarian', vegetarian: 'vegetarian', vegan: 'vegan', gf: 'gluten-free', halal: 'halal', spicy: 'spicy' };

// STARTERS
addItem({ category: 'Starters', name: 'Crispy Reef Calamari', description: 'Lightly battered squid, lime aioli, chilli salt.', price: 14500, allergens: [A.shellfish, A.gluten, A.eggs], dietary: [D.halal], tags: ['fried', 'seafood'], label: 'Chef’s pick', labelKind: 'promo', suggests: ['Fresh Lime Soda', 'Truffle Fries'] });
addItem({ category: 'Starters', name: 'Tuna Kandukukulhu Rolls', description: 'Smoked Maldivian tuna, coconut, chilli in crisp pastry.', price: 12000, allergens: [A.fish, A.gluten], dietary: [D.halal, D.spicy], tags: ['tuna', 'local'] });
addItem({ category: 'Starters', name: 'Coconut Prawn Skewers', description: 'Grilled prawns rolled in toasted coconut.', price: 16500, allergens: [A.shellfish], dietary: [D.halal, D.gf], tags: ['grill', 'seafood'] });
addItem({ category: 'Starters', name: 'Garden Spring Rolls', description: 'Crisp vegetable rolls, sweet chilli dip.', price: 9500, allergens: [A.gluten, A.soy], dietary: [D.vegan], tags: ['vegan', 'fried'] });
addItem({ category: 'Starters', name: 'Hummus & Roshi', description: 'Whipped chickpea hummus with warm flatbread.', price: 8500, allergens: [A.gluten, A.sesame], dietary: [D.vegetarian, D.vegan], tags: ['sharing'] });
addItem({ category: 'Starters', name: 'Chilli Paneer Bites', description: 'Wok-tossed paneer, capsicum, spring onion.', price: 11000, allergens: [A.dairy, A.soy], dietary: [D.vegetarian, D.spicy], tags: ['spicy'] });
addItem({ category: 'Starters', name: 'Reef Oysters (½ dozen)', description: 'Freshly shucked, mignonette & lemon.', price: 22000, allergens: [A.shellfish], dietary: [D.gf], tags: ['raw', 'premium'], availability: 'unavailable' });

// REEF SALADS
addItem({ category: 'Reef Salads', name: 'Island Garden Salad', description: 'Leaves, cucumber, tomato, herbs, citrus dressing.', price: 9500, dietary: [D.vegan, D.gf], tags: ['light'], options: ['SALAD_PROTEIN'], suggests: ['Watermelon Cooler'] });
addItem({ category: 'Reef Salads', name: 'Tuna Nicoise', description: 'Seared tuna, egg, beans, olives, potato.', price: 17500, allergens: [A.fish, A.eggs], dietary: [D.gf, D.halal], tags: ['protein'], options: ['SALAD_PROTEIN'] });
addItem({ category: 'Reef Salads', name: 'Halloumi & Watermelon', description: 'Grilled halloumi, watermelon, mint, lime.', price: 13500, allergens: [A.dairy], dietary: [D.vegetarian, D.gf], tags: ['summer'] });
addItem({ category: 'Reef Salads', name: 'Caesar Salad', description: 'Cos, parmesan, croutons, classic dressing.', price: 12000, allergens: [A.dairy, A.gluten, A.eggs, A.fish], dietary: [], tags: ['classic'], options: ['SALAD_PROTEIN'] });
addItem({ category: 'Reef Salads', name: 'Quinoa Power Bowl', description: 'Quinoa, avocado, chickpea, seeds, tahini.', price: 14000, allergens: [A.sesame], dietary: [D.vegan, D.gf], tags: ['healthy'], label: 'New', labelKind: 'new' });
addItem({ category: 'Reef Salads', name: 'Papaya & Prawn Salad', description: 'Green papaya, prawns, peanuts, nam jim.', price: 15500, allergens: [A.shellfish, A.peanuts, A.fish], dietary: [D.gf, D.spicy], tags: ['thai'] });

// SOUPS
addItem({ category: 'Soups', name: 'Garudhiya', description: 'Traditional Maldivian tuna broth, lime, chilli, rice.', price: 9000, allergens: [A.fish], dietary: [D.halal, D.gf], tags: ['local', 'signature'], label: 'Local favourite', labelKind: 'promo' });
addItem({ category: 'Soups', name: 'Tom Yum Goong', description: 'Hot & sour prawn soup, lemongrass, lime.', price: 12500, allergens: [A.shellfish, A.fish], dietary: [D.gf, D.spicy], tags: ['spicy'] });
addItem({ category: 'Soups', name: 'Sweetcorn & Crab', description: 'Silky corn soup with crab.', price: 11000, allergens: [A.shellfish, A.eggs], dietary: [], tags: ['comfort'] });
addItem({ category: 'Soups', name: 'Roasted Pumpkin Soup', description: 'Coconut cream, toasted seeds.', price: 9500, dietary: [D.vegan, D.gf], tags: ['vegan'] });
addItem({ category: 'Soups', name: 'Lentil & Coconut Dhal Soup', description: 'Spiced red lentils, curry leaf.', price: 8500, dietary: [D.vegan, D.gf], tags: ['comfort'] });

// FROM THE REEF
addItem({ category: 'From the Reef', name: 'Grilled Reef Fish', description: 'Whole catch of the day, garlic butter, herbs.', price: 28500, allergens: [A.fish, A.dairy], dietary: [D.gf, D.halal], tags: ['signature', 'grill'], options: ['SPICE'], suggests: ['Coconut Rice', 'Grilled Vegetables'] });
addItem({ category: 'From the Reef', name: 'Chilli Garlic Prawns', description: 'Tiger prawns, chilli, garlic, coriander.', price: 26000, allergens: [A.shellfish], dietary: [D.gf, D.halal, D.spicy], tags: ['spicy'], options: ['SPICE'] });
addItem({ category: 'From the Reef', name: 'Seared Yellowfin Tuna', description: 'Sesame crust, wasabi, pickled ginger.', price: 24500, allergens: [A.fish, A.sesame, A.soy], dietary: [D.halal], tags: ['premium'] });
addItem({ category: 'From the Reef', name: 'Butter Garlic Lobster', description: 'Half lobster, garlic butter, lime.', price: 48000, allergens: [A.shellfish, A.dairy], dietary: [D.gf], tags: ['premium'], label: 'Market price', labelKind: 'info' });
addItem({ category: 'From the Reef', name: 'Fish & Chips', description: 'Beer-battered reef fish, fries, tartare.', price: 18500, allergens: [A.fish, A.gluten, A.eggs], dietary: [D.halal], tags: ['classic'], suggests: ['Craft Lemonade'] });
addItem({ category: 'From the Reef', name: 'Crab Curry', description: 'Mud crab in coconut curry (unavailable today).', price: 32000, allergens: [A.shellfish], dietary: [D.gf, D.spicy], tags: ['curry'], availability: 'unavailable' });

// THE GRILL
addItem({ category: 'The Grill', name: 'Charcoal Ribeye 300g', description: 'Grass-fed ribeye, chimichurri.', price: 42000, allergens: [], dietary: [D.gf, D.halal], tags: ['steak', 'premium'], options: ['DONENESS'], suggests: ['Truffle Fries', 'Grilled Vegetables'] });
addItem({ category: 'The Grill', name: 'Peri-Peri Chicken', description: 'Half chicken, house peri-peri.', price: 22000, allergens: [], dietary: [D.gf, D.halal, D.spicy], tags: ['spicy'], options: ['SPICE'] });
addItem({ category: 'The Grill', name: 'Lamb Chops', description: 'Marinated chops, mint yoghurt.', price: 34000, allergens: [A.dairy], dietary: [D.gf, D.halal], tags: ['premium'], options: ['DONENESS'] });
addItem({ category: 'The Grill', name: 'Mixed Grill Platter', description: 'Chicken, lamb, prawns, sausage.', price: 39000, allergens: [A.shellfish], dietary: [D.halal], tags: ['sharing'], options: ['SPICE'] });
addItem({ category: 'The Grill', name: 'Grilled Vegetable Skewers', description: 'Seasonal vegetables, herb oil.', price: 13500, dietary: [D.vegan, D.gf], tags: ['vegan'] });

// ISLAND CURRIES
addItem({ category: 'Island Curries', name: 'Mas Riha (Tuna Curry)', description: 'Maldivian tuna curry, coconut, roshi.', price: 16500, allergens: [A.fish, A.gluten], dietary: [D.halal, D.spicy], tags: ['local', 'signature'], options: ['SPICE'], suggests: ['Coconut Rice', 'Butter Naan', 'Sweet Lassi', 'Poppadums & Chutney', 'Mango Chutney', 'Raita', 'Extra Lime Wedges', 'Garlic & Coriander Naan'] });
addItem({ category: 'Island Curries', name: 'Butter Chicken', description: 'Creamy tomato, fenugreek, charred chicken.', price: 17500, allergens: [A.dairy, A.nuts], dietary: [D.halal], tags: ['creamy'], options: ['SPICE'], suggests: ['Butter Naan', 'Coconut Rice', 'Poppadums & Chutney', 'Raita', 'Mango Chutney'] });
addItem({ category: 'Island Curries', name: 'Vegetable Korma', description: 'Mixed vegetables, cashew cream.', price: 14000, allergens: [A.dairy, A.nuts], dietary: [D.vegetarian], tags: ['creamy'], options: ['SPICE'] });
addItem({ category: 'Island Curries', name: 'Prawn Masala', description: 'Prawns in spiced onion-tomato masala.', price: 19500, allergens: [A.shellfish], dietary: [D.halal, D.gf, D.spicy], tags: ['spicy'], options: ['SPICE'] });
addItem({ category: 'Island Curries', name: 'Chana Masala', description: 'Chickpeas, tomato, warming spices.', price: 12500, dietary: [D.vegan, D.gf], tags: ['vegan'], options: ['SPICE'] });
addItem({ category: 'Island Curries', name: 'Beef Rendang', description: 'Slow-cooked beef, lemongrass, coconut.', price: 20000, dietary: [D.halal, D.gf, D.spicy], tags: ['slow-cooked'], options: ['SPICE'] });

// RICE & NOODLES
addItem({ category: 'Rice & Noodles', name: 'Nasi Goreng', description: 'Indonesian fried rice, fried egg, prawn cracker.', price: 15000, allergens: [A.eggs, A.shellfish, A.soy], dietary: [D.halal], tags: ['rice'], options: ['SPICE'] });
addItem({ category: 'Rice & Noodles', name: 'Pad Thai', description: 'Rice noodles, tamarind, peanuts, lime.', price: 14500, allergens: [A.peanuts, A.eggs, A.soy, A.shellfish], dietary: [], tags: ['noodles'], options: ['SALAD_PROTEIN'] });
addItem({ category: 'Rice & Noodles', name: 'Singapore Noodles', description: 'Curried vermicelli, prawns, chicken.', price: 15500, allergens: [A.shellfish, A.eggs, A.soy], dietary: [D.spicy], tags: ['noodles'] });
addItem({ category: 'Rice & Noodles', name: 'Vegetable Biryani', description: 'Fragrant basmati, vegetables, raita.', price: 14000, allergens: [A.dairy, A.nuts], dietary: [D.vegetarian], tags: ['rice'], options: ['SPICE'] });
addItem({ category: 'Rice & Noodles', name: 'Chicken Fried Rice', description: 'Wok rice, egg, spring onion.', price: 13500, allergens: [A.eggs, A.soy], dietary: [D.halal], tags: ['rice'] });
addItem({ category: 'Rice & Noodles', name: 'Coconut Rice', description: 'Steamed rice cooked in coconut milk.', price: 5500, dietary: [D.vegan, D.gf], tags: ['side'] });

// FLATBREADS & ROSHI
addItem({ category: 'Flatbreads & Roshi', name: 'Butter Naan', description: 'Tandoor naan brushed with butter.', price: 4500, allergens: [A.gluten, A.dairy], dietary: [D.vegetarian], tags: ['bread'] });
addItem({ category: 'Flatbreads & Roshi', name: 'Garlic & Coriander Naan', description: 'Tandoor naan, garlic, herbs.', price: 5000, allergens: [A.gluten, A.dairy], dietary: [D.vegetarian], tags: ['bread'] });
addItem({ category: 'Flatbreads & Roshi', name: 'Cheese Roshi', description: 'Maldivian flatbread stuffed with cheese.', price: 5500, allergens: [A.gluten, A.dairy], dietary: [D.vegetarian], tags: ['local'] });
addItem({ category: 'Flatbreads & Roshi', name: 'Plain Roshi', description: 'Traditional soft flatbread.', price: 3000, allergens: [A.gluten], dietary: [D.vegan], tags: ['local'] });
addItem({ category: 'Flatbreads & Roshi', name: 'Peshwari Naan', description: 'Sweet naan with coconut & nuts.', price: 5500, allergens: [A.gluten, A.dairy, A.nuts], dietary: [D.vegetarian], tags: ['bread'] });

// BURGERS & SANDWICHES
addItem({ category: 'Burgers & Sandwiches', name: 'Reef Beef Burger', description: 'Beef patty, cheddar, lettuce, house sauce, brioche.', price: 16500, allergens: [A.gluten, A.dairy, A.eggs, A.sesame], dietary: [D.halal], tags: ['burger', 'signature'], label: 'Best seller', labelKind: 'promo', options: ['DONENESS', 'BURGER_ADDONS'], suggests: ['Truffle Fries', 'Craft Lemonade', 'Chocolate Milkshake'] });
addItem({ category: 'Burgers & Sandwiches', name: 'Crispy Chicken Burger', description: 'Buttermilk chicken, slaw, chipotle mayo.', price: 15500, allergens: [A.gluten, A.dairy, A.eggs], dietary: [D.halal], tags: ['burger'], options: ['BURGER_ADDONS'], suggests: ['Truffle Fries', 'Craft Lemonade'] });
addItem({ category: 'Burgers & Sandwiches', name: 'Plant-Based Burger', description: 'Beetroot & bean patty, vegan cheese.', price: 15000, allergens: [A.gluten, A.soy], dietary: [D.vegan], tags: ['vegan', 'burger'], options: ['BURGER_ADDONS'] });
addItem({ category: 'Burgers & Sandwiches', name: 'Grilled Tuna Melt', description: 'Line-caught tuna, cheese, sourdough.', price: 14500, allergens: [A.fish, A.gluten, A.dairy], dietary: [D.halal], tags: ['sandwich'] });
addItem({ category: 'Burgers & Sandwiches', name: 'Club Sandwich', description: 'Triple-decker chicken, egg, tomato.', price: 14000, allergens: [A.gluten, A.eggs, A.dairy], dietary: [D.halal], tags: ['sandwich'], suggests: ['Truffle Fries'] });

// WOOD-FIRED PIZZA
addItem({ category: 'Wood-Fired Pizza', name: 'Margherita', description: 'San Marzano tomato, mozzarella, basil.', price: 15500, allergens: [A.gluten, A.dairy], dietary: [D.vegetarian], tags: ['pizza', 'classic'], options: ['SIZE', 'PIZZA_TOPPINGS'], suggests: ['Craft Lemonade'] });
addItem({ category: 'Wood-Fired Pizza', name: 'Reef Prawn Pizza', description: 'Prawns, chilli, garlic, rocket.', price: 21000, allergens: [A.gluten, A.dairy, A.shellfish], dietary: [D.spicy], tags: ['pizza', 'seafood'], options: ['SIZE', 'PIZZA_TOPPINGS'] });
addItem({ category: 'Wood-Fired Pizza', name: 'Diavola', description: 'Spicy beef pepperoni, chilli.', price: 18500, allergens: [A.gluten, A.dairy], dietary: [D.halal, D.spicy], tags: ['pizza', 'spicy'], options: ['SIZE', 'PIZZA_TOPPINGS'] });
addItem({ category: 'Wood-Fired Pizza', name: 'Quattro Formaggi', description: 'Four cheese, honey drizzle.', price: 19500, allergens: [A.gluten, A.dairy], dietary: [D.vegetarian], tags: ['pizza'], options: ['SIZE', 'PIZZA_TOPPINGS'] });
addItem({ category: 'Wood-Fired Pizza', name: 'Garden Vegetable', description: 'Grilled vegetables, pesto, vegan cheese.', price: 17500, allergens: [A.gluten, A.nuts], dietary: [D.vegan], tags: ['pizza', 'vegan'], options: ['SIZE', 'PIZZA_TOPPINGS'] });

// PASTA
addItem({ category: 'Pasta', name: 'Seafood Linguine', description: 'Prawns, calamari, tomato, chilli.', price: 19500, allergens: [A.gluten, A.shellfish], dietary: [D.spicy], tags: ['pasta', 'seafood'] });
addItem({ category: 'Pasta', name: 'Spaghetti Carbonara', description: 'Egg, pecorino, black pepper, pancetta.', price: 16500, allergens: [A.gluten, A.dairy, A.eggs], dietary: [], tags: ['pasta', 'classic'] });
addItem({ category: 'Pasta', name: 'Penne Arrabbiata', description: 'Spicy tomato, garlic, chilli.', price: 14000, allergens: [A.gluten], dietary: [D.vegan, D.spicy], tags: ['pasta', 'vegan'] });
addItem({ category: 'Pasta', name: 'Mushroom Truffle Pasta', description: 'Wild mushroom, cream, truffle.', price: 18000, allergens: [A.gluten, A.dairy], dietary: [D.vegetarian], tags: ['pasta'] });
addItem({ category: 'Pasta', name: 'Lasagne al Forno', description: 'Layered beef ragu, béchamel.', price: 17000, allergens: [A.gluten, A.dairy, A.eggs], dietary: [D.halal], tags: ['pasta', 'baked'] });

// SIDES
addItem({ category: 'Sides', name: 'Truffle Fries', description: 'Skinny fries, truffle, parmesan.', price: 7500, allergens: [A.dairy], dietary: [D.vegetarian, D.gf], tags: ['side'], options: ['FRIES_SIZE'] });
addItem({ category: 'Sides', name: 'Sweet Potato Fries', description: 'Crispy fries, chipotle mayo.', price: 7000, allergens: [A.eggs], dietary: [D.vegetarian, D.gf], tags: ['side'], options: ['FRIES_SIZE'] });
addItem({ category: 'Sides', name: 'Grilled Vegetables', description: 'Chargrilled seasonal vegetables.', price: 6500, dietary: [D.vegan, D.gf], tags: ['side'] });
addItem({ category: 'Sides', name: 'Onion Rings', description: 'Beer-battered, smoky ketchup.', price: 6000, allergens: [A.gluten], dietary: [D.vegetarian], tags: ['side'] });
addItem({ category: 'Sides', name: 'Steamed Jasmine Rice', description: 'Fragrant steamed rice.', price: 4000, dietary: [D.vegan, D.gf], tags: ['side'] });
addItem({ category: 'Sides', name: 'House Side Salad', description: 'Leaves, cucumber, citrus dressing.', price: 5500, dietary: [D.vegan, D.gf], tags: ['side'] });

// DESSERTS
addItem({ category: 'Desserts', name: 'Bibikhaandu', description: 'Maldivian coconut & semolina cake.', price: 8500, allergens: [A.gluten, A.dairy, A.eggs, A.nuts], dietary: [D.vegetarian], tags: ['local'], label: 'Local sweet', labelKind: 'promo' });
addItem({ category: 'Desserts', name: 'Molten Chocolate Cake', description: 'Warm centre, vanilla ice cream.', price: 9500, allergens: [A.gluten, A.dairy, A.eggs], dietary: [D.vegetarian], tags: ['chocolate'], suggests: ['Flat White'] });
addItem({ category: 'Desserts', name: 'Mango Sticky Rice', description: 'Coconut sticky rice, fresh mango.', price: 8500, dietary: [D.vegan, D.gf], tags: ['tropical'] });
addItem({ category: 'Desserts', name: 'Crème Brûlée', description: 'Vanilla custard, caramel crust.', price: 8500, allergens: [A.dairy, A.eggs], dietary: [D.vegetarian, D.gf], tags: ['classic'] });
addItem({ category: 'Desserts', name: 'Tropical Fruit Plate', description: 'Seasonal island fruit.', price: 7500, dietary: [D.vegan, D.gf], tags: ['light'] });
addItem({ category: 'Desserts', name: 'Affogato', description: 'Espresso over vanilla gelato.', price: 7000, allergens: [A.dairy], dietary: [D.vegetarian, D.gf], tags: ['coffee'] });

// HOT DRINKS
addItem({ category: 'Hot Drinks', name: 'Flat White', description: 'Double ristretto, silky milk.', price: 5500, allergens: [A.dairy], dietary: [D.vegetarian], tags: ['coffee'], beverage: true, options: ['MILK', 'COFFEE_EXTRAS'] });
addItem({ category: 'Hot Drinks', name: 'Cappuccino', description: 'Espresso, steamed milk, foam.', price: 5500, allergens: [A.dairy], dietary: [D.vegetarian], tags: ['coffee'], beverage: true, options: ['MILK', 'COFFEE_EXTRAS'] });
addItem({ category: 'Hot Drinks', name: 'Latte', description: 'Espresso, plenty of steamed milk.', price: 5500, allergens: [A.dairy], dietary: [D.vegetarian], tags: ['coffee'], beverage: true, options: ['MILK', 'COFFEE_EXTRAS'] });
addItem({ category: 'Hot Drinks', name: 'Espresso', description: 'Double shot.', price: 4000, dietary: [D.vegan], tags: ['coffee'], beverage: true, options: ['COFFEE_EXTRAS'] });
addItem({ category: 'Hot Drinks', name: 'Masala Chai', description: 'Spiced black tea, steamed milk.', price: 4500, allergens: [A.dairy], dietary: [D.vegetarian], tags: ['tea'], beverage: true, options: ['MILK'] });
addItem({ category: 'Hot Drinks', name: 'Fresh Mint Tea', description: 'Moroccan-style mint tea.', price: 4000, dietary: [D.vegan], tags: ['tea'], beverage: true, options: ['SUGAR'] });

// COLD DRINKS
addItem({ category: 'Cold Drinks', name: 'Fresh Lime Soda', description: 'Lime, soda, choice of sweetness.', price: 5500, dietary: [D.vegan, D.gf], tags: ['refreshing'], beverage: true, options: ['SUGAR'] });
addItem({ category: 'Cold Drinks', name: 'Craft Lemonade', description: 'House lemonade, mint.', price: 5000, dietary: [D.vegan, D.gf], tags: ['refreshing'], beverage: true, options: ['SUGAR'] });
addItem({ category: 'Cold Drinks', name: 'Iced Latte', description: 'Espresso over iced milk.', price: 6000, allergens: [A.dairy], dietary: [D.vegetarian], tags: ['coffee'], beverage: true, options: ['MILK', 'COFFEE_EXTRAS'] });
addItem({ category: 'Cold Drinks', name: 'Cola', description: 'Chilled classic cola.', price: 3500, dietary: [D.vegan], tags: ['soda'], beverage: true });
addItem({ category: 'Cold Drinks', name: 'Iced Tea', description: 'House-brewed, lemon.', price: 4500, dietary: [D.vegan], tags: ['refreshing'], beverage: true, options: ['SUGAR'] });
addItem({ category: 'Cold Drinks', name: 'Ginger Beer', description: 'Fiery non-alcoholic ginger beer.', price: 5000, dietary: [D.vegan], tags: ['refreshing'], beverage: true });

// FRESH JUICES
addItem({ category: 'Fresh Juices', name: 'Watermelon Cooler', description: 'Pressed watermelon, mint, lime.', price: 6500, dietary: [D.vegan, D.gf], tags: ['juice'], beverage: true, options: ['SUGAR'] });
addItem({ category: 'Fresh Juices', name: 'Orange Juice', description: 'Freshly squeezed oranges.', price: 6000, dietary: [D.vegan, D.gf], tags: ['juice'], beverage: true });
addItem({ category: 'Fresh Juices', name: 'Pineapple & Ginger', description: 'Pineapple, ginger, lime.', price: 6500, dietary: [D.vegan, D.gf], tags: ['juice'], beverage: true });
addItem({ category: 'Fresh Juices', name: 'Green Detox', description: 'Cucumber, apple, spinach, lime.', price: 7000, dietary: [D.vegan, D.gf], tags: ['juice', 'healthy'], beverage: true });
addItem({ category: 'Fresh Juices', name: 'Passionfruit Crush', description: 'Passionfruit, orange, honey.', price: 7000, dietary: [D.vegetarian, D.gf], tags: ['juice'], beverage: true, options: ['SUGAR'] });

// SMOOTHIES
addItem({ category: 'Smoothies', name: 'Mango Coconut Smoothie', description: 'Mango, coconut, banana.', price: 7500, allergens: [A.dairy], dietary: [D.vegetarian, D.gf], tags: ['smoothie'], beverage: true });
addItem({ category: 'Smoothies', name: 'Berry Blast', description: 'Mixed berries, yoghurt, honey.', price: 7500, allergens: [A.dairy], dietary: [D.vegetarian, D.gf], tags: ['smoothie'], beverage: true });
addItem({ category: 'Smoothies', name: 'Peanut Banana', description: 'Banana, peanut butter, oat milk.', price: 7500, allergens: [A.peanuts], dietary: [D.vegan], tags: ['smoothie'], beverage: true });
addItem({ category: 'Smoothies', name: 'Chocolate Milkshake', description: 'Rich chocolate, vanilla ice cream.', price: 8000, allergens: [A.dairy], dietary: [D.vegetarian], tags: ['shake'], beverage: true, options: ['SIZE'] });
addItem({ category: 'Smoothies', name: 'Sweet Lassi', description: 'Yoghurt, cardamom, rose.', price: 6000, allergens: [A.dairy], dietary: [D.vegetarian, D.gf], tags: ['lassi'], beverage: true, options: ['SUGAR'] });

// WATER
addItem({ category: 'Water', name: 'Still Water', description: 'Local still water, 500ml.', price: 2500, dietary: [D.vegan, D.gf], tags: ['water'], beverage: true, options: ['SIZE'] });
addItem({ category: 'Water', name: 'Sparkling Water', description: 'Chilled sparkling water, 500ml.', price: 3000, dietary: [D.vegan, D.gf], tags: ['water'], beverage: true, options: ['SIZE'] });
addItem({ category: 'Water', name: 'Coconut Water', description: 'Fresh young coconut.', price: 4500, dietary: [D.vegan, D.gf], tags: ['water', 'tropical'], beverage: true });

// A few more to comfortably exceed 100 live items
addItem({ category: 'Starters', name: 'Salt & Pepper Squid', description: 'Wok-tossed squid, chilli, spring onion.', price: 13500, allergens: [A.shellfish, A.gluten], dietary: [D.halal, D.spicy], tags: ['seafood'] });
addItem({ category: 'The Grill', name: 'Grilled Prawn Platter', description: 'Six tiger prawns, garlic butter.', price: 29000, allergens: [A.shellfish, A.dairy], dietary: [D.gf, D.halal], tags: ['premium'], options: ['SPICE'] });
addItem({ category: 'Sides', name: 'Garlic Bread', description: 'Wood-fired, garlic butter, herbs.', price: 5500, allergens: [A.gluten, A.dairy], dietary: [D.vegetarian], tags: ['side'], options: ['FRIES_SIZE'] });
addItem({ category: 'Desserts', name: 'Coconut Panna Cotta', description: 'Silky coconut cream, mango coulis.', price: 8000, allergens: [A.dairy], dietary: [D.vegetarian, D.gf], tags: ['tropical'] });
addItem({ category: 'Cold Drinks', name: 'Sparkling Apple', description: 'Chilled sparkling apple juice.', price: 4500, dietary: [D.vegan], tags: ['soda'], beverage: true });
addItem({ category: 'Fresh Juices', name: 'Beetroot Boost', description: 'Beetroot, apple, ginger, lemon.', price: 7000, dietary: [D.vegan, D.gf], tags: ['juice', 'healthy'], beverage: true });
addItem({ category: 'Pasta', name: 'Gnocchi Pomodoro', description: 'Potato gnocchi, basil, tomato.', price: 15500, allergens: [A.gluten, A.dairy], dietary: [D.vegetarian], tags: ['pasta'] });
addItem({ category: 'Rice & Noodles', name: 'Khichuni Rice Bowl', description: 'Spiced lentil & rice, crispy onion.', price: 12500, dietary: [D.vegan, D.gf], tags: ['rice', 'comfort'], options: ['SPICE'] });

// Suggestion-only add-ons: orderable & suggestable, but hidden from browsing
addItem({ category: 'Flatbreads & Roshi', name: 'Poppadums & Chutney', description: 'Crisp poppadums with mango chutney & mint yoghurt.', price: 4500, allergens: [A.dairy], dietary: [D.vegetarian], tags: ['add-on'], listed: false });
addItem({ category: 'Sides', name: 'Mango Chutney', description: 'A little pot of sweet mango chutney.', price: 2000, dietary: [D.vegan, D.gf], tags: ['add-on'], listed: false });
addItem({ category: 'Sides', name: 'Raita', description: 'Cooling cucumber yoghurt.', price: 2500, allergens: [A.dairy], dietary: [D.vegetarian, D.gf], tags: ['add-on'], listed: false });
addItem({ category: 'Sides', name: 'Extra Lime Wedges', description: 'Fresh lime wedges.', price: 1000, dietary: [D.vegan, D.gf], tags: ['add-on'], listed: false });

// A disabled item (excluded from customer menu) to prove filtering
addItem({ category: 'Starters', name: 'Retired Nachos (hidden)', description: 'Removed from the menu.', price: 9000, allergens: [A.dairy, A.gluten], dietary: [D.vegetarian], tags: ['hidden'], enabled: 0 });

// ---- Emit item + option group + choice SQL ----
const nameToId = new Map(items.map((it) => [it.name, it.id]));
items.forEach((it, i) => {
	sql.push(`INSERT INTO items (id, restaurant_id, category_id, name, description, base_price, image_seed, availability, enabled, listed, allergens, dietary, tags, label, label_kind, is_beverage, display_order, created_at, updated_at)
		VALUES (${it.id}, 1, ${it.categoryId}, ${q(it.name)}, ${q(it.description)}, ${it.price}, ${q(it.imageSeed)}, ${q(it.availability)}, ${it.enabled}, ${it.listed}, ${q(JSON.stringify(it.allergens))}, ${q(JSON.stringify(it.dietary))}, ${q(JSON.stringify(it.tags))}, ${q(it.label)}, ${q(it.labelKind)}, ${it.isBeverage}, ${i + 1}, ${now}, ${now});`);
	it.options.forEach((tplKey, gi) => {
		const tpl = groupTemplates[tplKey];
		groupId += 1;
		const gid = groupId;
		sql.push(`INSERT INTO option_groups (id, restaurant_id, item_id, name, selection_type, required, min_select, max_select, allow_none, display_order)
			VALUES (${gid}, 1, ${it.id}, ${q(tpl.name)}, ${q(tpl.type)}, ${tpl.required}, ${tpl.min}, ${tpl.max}, ${tpl.none}, ${gi + 1});`);
		tpl.choices.forEach(([cname, adj, def], ci) => {
			choiceId += 1;
			sql.push(`INSERT INTO option_choices (id, restaurant_id, group_id, name, price_adjustment, is_default, display_order)
				VALUES (${choiceId}, 1, ${gid}, ${q(cname)}, ${adj}, ${def}, ${ci + 1});`);
		});
	});
});

// ---- Suggestions ----
let suggestionOrder = 0;
for (const it of items) {
	it.suggests.forEach((targetName, idx) => {
		const targetId = nameToId.get(targetName);
		if (!targetId || targetId === it.id) return;
		suggestionOrder += 1;
		sql.push(`INSERT INTO suggestions (restaurant_id, source_item_id, target_item_id, display_order, enabled, created_at)
			VALUES (1, ${it.id}, ${targetId}, ${idx + 1}, 1, ${now});`);
	});
}

// ---- Beverage prompt targets ----
for (const catName of ['Cold Drinks', 'Fresh Juices']) {
	sql.push(`INSERT INTO beverage_prompt_categories (restaurant_id, category_id) VALUES (1, ${cat(catName)});`);
}
for (const [i, itemName] of ['Still Water', 'Sparkling Water', 'Coconut Water', 'Fresh Lime Soda'].entries()) {
	const id = nameToId.get(itemName);
	if (id) sql.push(`INSERT INTO beverage_prompt_items (restaurant_id, item_id, display_order) VALUES (1, ${id}, ${i + 1});`);
}

// ---- Tables ----
// Deterministic yet opaque tokens so demo/test URLs stay stable across reseeds.
function detHex(n) {
	let x = (0x9e3779b1 ^ Math.imul(n, 2654435761)) >>> 0;
	let out = '';
	for (let i = 0; i < 8; i++) {
		x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
		out += (x >>> 24).toString(16).padStart(2, '0');
	}
	return out;
}
const tableTokens = [];
for (let t = 1; t <= 12; t++) {
	const token = `tbl_${t.toString().padStart(2, '0')}_${detHex(t)}`;
	tableTokens.push({ label: `Table ${t}`, token });
	sql.push(`INSERT INTO tables (id, restaurant_id, label, token, enabled, created_at)
		VALUES (${t}, 1, ${q('Table ' + t)}, ${q(token)}, ${t === 12 ? 0 : 1}, ${now});`);
}

// ---- Users ----
const userDefs = [
	{ id: 1, username: 'admin', name: 'Aria Admin', role: 'admin', password: 'menyue-admin' },
	{ id: 2, username: 'manager', name: 'Maya Manager', role: 'manager', password: 'menyue-manager' },
	{ id: 3, username: 'counter', name: 'Kai Counter', role: 'counter', password: 'menyue-counter' }
];

const main = async () => {
	for (const u of userDefs) {
		const { hash, salt } = await hashPassword(u.password);
		sql.push(`INSERT INTO users (id, restaurant_id, username, display_name, role, password_hash, password_salt, created_at)
			VALUES (${u.id}, 1, ${q(u.username)}, ${q(u.name)}, ${q(u.role)}, ${q(hash)}, ${q(salt)}, ${now});`);
	}

	mkdirSync(join(root, '.tmp'), { recursive: true });
	const outFile = join(root, '.tmp', 'seed.sql');
	writeFileSync(outFile, sql.join('\n'), 'utf8');

	console.log(`Seeding ${items.length} items, ${categories.length} categories, ${tableTokens.length} tables…`);
	execFileSync('npx', ['wrangler', 'd1', 'execute', 'menyue', '--local', `--file=${outFile}`], {
		cwd: root,
		stdio: 'inherit',
		shell: true
	});

	console.log('\nSeed complete.');
	console.log('Sign-in credentials:');
	userDefs.forEach((u) => console.log(`  ${u.role.padEnd(8)} ${u.username} / ${u.password}`));
	console.log('\nGuest table URLs (token):');
	tableTokens.slice(0, 3).forEach((t) => console.log(`  ${t.label}: /t/${t.token}`));
	writeFileSync(join(root, '.tmp', 'tables.json'), JSON.stringify(tableTokens, null, 2));
};

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
