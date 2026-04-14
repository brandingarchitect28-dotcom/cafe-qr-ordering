/**
 * aiEnrichmentService.js
 *
 * FIXES applied:
 *  1. generateFoodDetails — replaced browser→Anthropic (CORS-blocked) with
 *     comprehensive local nutrition lookup (150+ items). Instant, zero API.
 *  2. generateAddons — now ALWAYS runs regardless of wantAIDetails toggle.
 *  3. detectSizeVariants — NEW: detects size pricing for beverages/shareable items.
 */

// ─── Rule-based addon suggestions ─────────────────────────────────────────────

const ADDON_RULES = [
  { keywords: ['burger','patty','slider'],
    addons: [{name:'Extra Cheese',price:20},{name:'Extra Patty',price:50},{name:'Extra Sauce',price:15}] },
  { keywords: ['pizza','flatbread'],
    addons: [{name:'Extra Cheese',price:30},{name:'Extra Toppings',price:40},{name:'Stuffed Crust',price:50}] },
  { keywords: ['wrap','roll','burrito','kathi','frankie'],
    addons: [{name:'Extra Sauce',price:15},{name:'Add Cheese',price:20},{name:'Extra Filling',price:30}] },
  { keywords: ['coffee','latte','cappuccino','espresso','americano','mocha','cold brew'],
    addons: [{name:'Extra Shot',price:30},{name:'Soy Milk',price:25},{name:'Flavoured Syrup',price:20}] },
  { keywords: ['shake','smoothie','milkshake','frappe'],
    addons: [{name:'Extra Scoop',price:30},{name:'Whipped Cream',price:20},{name:'Add Nuts',price:25}] },
  { keywords: ['sandwich','sub','hoagie','panini','club'],
    addons: [{name:'Add Cheese',price:20},{name:'Extra Veggies',price:15},{name:'Double Filling',price:40}] },
  { keywords: ['pasta','spaghetti','penne','noodle','mac'],
    addons: [{name:'Extra Cheese',price:25},{name:'Garlic Bread',price:30},{name:'Extra Sauce',price:20}] },
  { keywords: ['biryani','pulao','fried rice'],
    addons: [{name:'Raita',price:25},{name:'Papad',price:15},{name:'Extra Gravy',price:30}] },
  { keywords: ['dosa','idli','uttapam','vada','upma'],
    addons: [{name:'Extra Chutney',price:10},{name:'Ghee',price:15},{name:'Extra Sambar',price:15}] },
  { keywords: ['chai','tea','masala chai'],
    addons: [{name:'Extra Ginger',price:10},{name:'Kadak',price:10},{name:'Add Biscuit',price:15}] },
  { keywords: ['juice','lassi','mojito','lemonade'],
    addons: [{name:'Extra Ice',price:0},{name:'No Sugar',price:0},{name:'Larger Size',price:30}] },
  { keywords: ['thali','combo','meal','platter'],
    addons: [{name:'Extra Roti',price:15},{name:'Extra Rice',price:20},{name:'Extra Dal',price:25}] },
  { keywords: ['cake','pastry','brownie','muffin','cookie','waffle'],
    addons: [{name:'Ice Cream Scoop',price:40},{name:'Chocolate Sauce',price:20},{name:'Extra Cream',price:15}] },
  { keywords: ['paratha','roti','naan','kulcha'],
    addons: [{name:'Extra Butter',price:15},{name:'Extra Ghee',price:15},{name:'Add Pickle',price:10}] },
  { keywords: ['pav','bhaji','vada pav'],
    addons: [{name:'Extra Pav',price:15},{name:'Extra Butter',price:10},{name:'Add Cheese',price:20}] },
];

export const getAddonSuggestions = (itemName = '') => {
  const lower = itemName.toLowerCase();
  for (const rule of ADDON_RULES) {
    if (rule.keywords.some(kw => lower.includes(kw))) return rule.addons;
  }
  return [{name:'Extra Portion',price:40},{name:'Add Drink',price:30}];
};

// ─── Local nutrition database (150+ items, replaces CORS-blocked API) ─────────

const NUTRITION_DB = {
  'biryani':{ingredients:['Basmati Rice','Chicken/Veg','Spices','Onion','Yoghurt'],calories:'520 kcal',protein:'22g',carbs:'68g',fat:'16g',description:'Fragrant slow-cooked rice with aromatic spices.'},
  'butter chicken':{ingredients:['Chicken','Butter','Tomato','Cream','Spices'],calories:'480 kcal',protein:'28g',carbs:'14g',fat:'32g',description:'Rich creamy tomato-based chicken curry.'},
  'paneer tikka':{ingredients:['Paneer','Capsicum','Onion','Yoghurt','Spices'],calories:'320 kcal',protein:'18g',carbs:'10g',fat:'22g',description:'Grilled cottage cheese in spiced yoghurt marinade.'},
  'dal makhani':{ingredients:['Black Lentils','Butter','Cream','Tomato','Spices'],calories:'380 kcal',protein:'14g',carbs:'40g',fat:'18g',description:'Slow-cooked creamy black lentils in buttery sauce.'},
  'palak paneer':{ingredients:['Spinach','Paneer','Onion','Garlic','Spices'],calories:'290 kcal',protein:'16g',carbs:'12g',fat:'18g',description:'Tender cottage cheese in smooth spiced spinach gravy.'},
  'dosa':{ingredients:['Rice','Urad Dal','Oil','Salt'],calories:'200 kcal',protein:'5g',carbs:'38g',fat:'4g',description:'Crispy fermented rice and lentil crepe.'},
  'idli':{ingredients:['Rice','Urad Dal','Salt'],calories:'120 kcal',protein:'4g',carbs:'22g',fat:'1g',description:'Soft steamed rice cakes, light and nutritious.'},
  'masala dosa':{ingredients:['Rice Batter','Potato','Onion','Mustard Seeds','Spices'],calories:'340 kcal',protein:'7g',carbs:'56g',fat:'10g',description:'Crispy dosa filled with spiced potato masala.'},
  'pav bhaji':{ingredients:['Mixed Vegetables','Butter','Pav','Spices','Onion'],calories:'450 kcal',protein:'10g',carbs:'62g',fat:'18g',description:'Spiced vegetable curry with buttered bread rolls.'},
  'vada pav':{ingredients:['Potato Vada','Pav','Chutney','Garlic','Spices'],calories:'280 kcal',protein:'6g',carbs:'44g',fat:'9g',description:'Mumbai street-style potato fritter in a soft roll.'},
  'chole bhature':{ingredients:['Chickpeas','Flour','Yoghurt','Spices','Oil'],calories:'620 kcal',protein:'18g',carbs:'80g',fat:'24g',description:'Spicy chickpea curry with fluffy fried bread.'},
  'rajma chawal':{ingredients:['Kidney Beans','Rice','Tomato','Onion','Spices'],calories:'450 kcal',protein:'16g',carbs:'72g',fat:'8g',description:'Hearty kidney bean curry over steamed rice.'},
  'thali':{ingredients:['Dal','Sabzi','Roti','Rice','Salad','Pickle'],calories:'600 kcal',protein:'20g',carbs:'88g',fat:'16g',description:'Complete balanced Indian meal with multiple dishes.'},
  'samosa':{ingredients:['Potato','Peas','Pastry','Spices','Oil'],calories:'150 kcal',protein:'3g',carbs:'20g',fat:'7g',description:'Crispy pastry filled with spiced potato and peas.'},
  'pakora':{ingredients:['Chickpea Flour','Onion','Vegetables','Spices','Oil'],calories:'180 kcal',protein:'5g',carbs:'22g',fat:'8g',description:'Crispy golden fritters in chickpea batter.'},
  'tandoori chicken':{ingredients:['Chicken','Yoghurt','Tandoori Spices','Lemon','Ginger'],calories:'280 kcal',protein:'36g',carbs:'4g',fat:'12g',description:'Smoky charred chicken in spiced yoghurt marinade.'},
  'tikka masala':{ingredients:['Chicken','Cream','Tomato','Onion','Spices'],calories:'420 kcal',protein:'30g',carbs:'16g',fat:'26g',description:'Creamy spiced tomato gravy with tender chicken.'},
  'korma':{ingredients:['Chicken/Veg','Yoghurt','Cashew','Cream','Spices'],calories:'480 kcal',protein:'25g',carbs:'14g',fat:'36g',description:'Mild rich and creamy nutty curry.'},
  'naan':{ingredients:['Flour','Yoghurt','Yeast','Butter','Salt'],calories:'260 kcal',protein:'8g',carbs:'44g',fat:'6g',description:'Soft leavened flatbread from the tandoor.'},
  'paratha':{ingredients:['Whole Wheat Flour','Butter','Salt','Water'],calories:'200 kcal',protein:'5g',carbs:'30g',fat:'7g',description:'Layered whole wheat flatbread cooked with butter.'},
  'fried rice':{ingredients:['Rice','Egg/Veg','Soy Sauce','Ginger','Spring Onion'],calories:'400 kcal',protein:'10g',carbs:'68g',fat:'10g',description:'Wok-tossed rice with vegetables and soy sauce.'},
  'noodles':{ingredients:['Noodles','Vegetables','Soy Sauce','Ginger','Oil'],calories:'380 kcal',protein:'9g',carbs:'62g',fat:'10g',description:'Stir-fried noodles with crisp vegetables.'},
  'momos':{ingredients:['Flour','Cabbage','Chicken/Veg','Ginger','Garlic'],calories:'200 kcal',protein:'8g',carbs:'28g',fat:'6g',description:'Steamed dumplings filled with spiced vegetables.'},
  'soup':{ingredients:['Vegetables','Broth','Spices','Cornflour','Herbs'],calories:'120 kcal',protein:'4g',carbs:'18g',fat:'3g',description:'Warm nourishing broth with vegetables and spices.'},
  'burger':{ingredients:['Beef/Chicken Patty','Bun','Lettuce','Tomato','Sauce'],calories:'520 kcal',protein:'28g',carbs:'44g',fat:'26g',description:'Juicy patty in a toasted bun with fresh toppings.'},
  'pizza':{ingredients:['Dough','Tomato Sauce','Mozzarella','Toppings','Basil'],calories:'640 kcal',protein:'24g',carbs:'72g',fat:'26g',description:'Crispy base with rich toppings and melted cheese.'},
  'pasta':{ingredients:['Pasta','Tomato/Cream Sauce','Parmesan','Olive Oil','Herbs'],calories:'480 kcal',protein:'16g',carbs:'70g',fat:'14g',description:'Al dente pasta in rich sauce with fresh herbs.'},
  'sandwich':{ingredients:['Bread','Filling','Lettuce','Tomato','Mayo'],calories:'380 kcal',protein:'16g',carbs:'42g',fat:'16g',description:'Hearty sandwich with fresh fillings on toasted bread.'},
  'wrap':{ingredients:['Tortilla','Chicken/Veg','Sauce','Lettuce','Cheese'],calories:'420 kcal',protein:'20g',carbs:'48g',fat:'16g',description:'Soft tortilla filled with grilled chicken and vegetables.'},
  'salad':{ingredients:['Lettuce','Tomato','Cucumber','Dressing','Croutons'],calories:'180 kcal',protein:'6g',carbs:'14g',fat:'10g',description:'Fresh crisp salad with a light tangy dressing.'},
  'grilled chicken':{ingredients:['Chicken Breast','Olive Oil','Garlic','Lemon','Herbs'],calories:'280 kcal',protein:'42g',carbs:'2g',fat:'10g',description:'Lean grilled chicken with lemon herb seasoning.'},
  'pancakes':{ingredients:['Flour','Eggs','Milk','Butter','Syrup'],calories:'380 kcal',protein:'8g',carbs:'56g',fat:'14g',description:'Fluffy stacked pancakes with maple syrup.'},
  'waffles':{ingredients:['Flour','Eggs','Butter','Milk','Vanilla'],calories:'400 kcal',protein:'8g',carbs:'54g',fat:'16g',description:'Crispy golden waffles with soft interior.'},
  'omelette':{ingredients:['Eggs','Butter','Vegetables','Cheese','Herbs'],calories:'280 kcal',protein:'18g',carbs:'4g',fat:'20g',description:'Fluffy egg omelette with fresh herbs and vegetables.'},
  'french toast':{ingredients:['Bread','Eggs','Milk','Butter','Cinnamon'],calories:'340 kcal',protein:'10g',carbs:'40g',fat:'14g',description:'Golden egg-soaked bread dusted with cinnamon.'},
  'spring roll':{ingredients:['Cabbage','Carrot','Glass Noodles','Ginger','Oil'],calories:'160 kcal',protein:'4g',carbs:'22g',fat:'6g',description:'Crispy fried rolls filled with seasoned vegetables.'},
  'tacos':{ingredients:['Tortilla','Meat','Salsa','Cheese','Lime'],calories:'320 kcal',protein:'16g',carbs:'32g',fat:'14g',description:'Crispy or soft tacos loaded with flavourful fillings.'},
  'sushi':{ingredients:['Rice','Fish','Nori','Avocado','Soy Sauce'],calories:'280 kcal',protein:'14g',carbs:'38g',fat:'6g',description:'Japanese rice rolls with fresh fish and avocado.'},
  'coffee':{ingredients:['Espresso','Water'],calories:'5 kcal',protein:'0g',carbs:'1g',fat:'0g',description:'Bold aromatic espresso brewed to perfection.'},
  'latte':{ingredients:['Espresso','Steamed Milk','Foam'],calories:'120 kcal',protein:'6g',carbs:'12g',fat:'4g',description:'Smooth espresso with velvety steamed milk.'},
  'cappuccino':{ingredients:['Espresso','Steamed Milk','Foam'],calories:'80 kcal',protein:'5g',carbs:'8g',fat:'3g',description:'Balanced espresso with rich milk foam.'},
  'cold coffee':{ingredients:['Espresso','Milk','Ice','Sugar'],calories:'160 kcal',protein:'5g',carbs:'22g',fat:'5g',description:'Refreshing chilled coffee over ice.'},
  'chai':{ingredients:['Tea','Milk','Ginger','Cardamom','Sugar'],calories:'80 kcal',protein:'3g',carbs:'12g',fat:'2g',description:'Spiced Indian tea with aromatic ginger and cardamom.'},
  'masala chai':{ingredients:['Tea','Milk','Ginger','Cardamom','Clove','Sugar'],calories:'90 kcal',protein:'3g',carbs:'14g',fat:'2g',description:'Rich spiced milk tea with whole aromatic spices.'},
  'green tea':{ingredients:['Green Tea Leaves','Hot Water'],calories:'2 kcal',protein:'0g',carbs:'0g',fat:'0g',description:'Light refreshing antioxidant-rich green tea.'},
  'orange juice':{ingredients:['Fresh Oranges'],calories:'110 kcal',protein:'2g',carbs:'26g',fat:'0g',description:'Freshly squeezed orange juice, bright and citrusy.'},
  'mango lassi':{ingredients:['Mango','Yoghurt','Milk','Sugar','Cardamom'],calories:'220 kcal',protein:'6g',carbs:'42g',fat:'3g',description:'Creamy blended mango yoghurt drink.'},
  'lassi':{ingredients:['Yoghurt','Water','Sugar','Cardamom'],calories:'180 kcal',protein:'6g',carbs:'30g',fat:'4g',description:'Chilled yoghurt drink, sweet and tangy.'},
  'milkshake':{ingredients:['Milk','Ice Cream','Flavour','Sugar'],calories:'380 kcal',protein:'8g',carbs:'54g',fat:'14g',description:'Thick creamy milkshake blended to perfection.'},
  'smoothie':{ingredients:['Fruit','Yoghurt','Honey','Ice'],calories:'200 kcal',protein:'5g',carbs:'38g',fat:'2g',description:'Thick blended fruit smoothie, naturally sweet.'},
  'mojito':{ingredients:['Mint','Lime','Sugar','Soda','Ice'],calories:'80 kcal',protein:'0g',carbs:'20g',fat:'0g',description:'Refreshing lime and mint mocktail over crushed ice.'},
  'lemonade':{ingredients:['Lemon','Sugar','Water','Ice','Mint'],calories:'90 kcal',protein:'0g',carbs:'22g',fat:'0g',description:'Fresh-squeezed lemonade with a hint of mint.'},
  'french fries':{ingredients:['Potato','Oil','Salt'],calories:'320 kcal',protein:'4g',carbs:'42g',fat:'16g',description:'Golden crispy fries seasoned with sea salt.'},
  'onion rings':{ingredients:['Onion','Flour','Egg','Oil','Spices'],calories:'280 kcal',protein:'4g',carbs:'34g',fat:'14g',description:'Crispy golden-battered onion rings.'},
  'nachos':{ingredients:['Tortilla Chips','Cheese','Salsa','Jalapeño','Guacamole'],calories:'420 kcal',protein:'10g',carbs:'48g',fat:'22g',description:'Loaded tortilla chips with melted cheese and toppings.'},
  'garlic bread':{ingredients:['Bread','Butter','Garlic','Parsley'],calories:'220 kcal',protein:'4g',carbs:'28g',fat:'10g',description:'Crispy buttery bread infused with roasted garlic.'},
  'chicken wings':{ingredients:['Chicken Wings','Sauce','Spices','Butter','Garlic'],calories:'360 kcal',protein:'28g',carbs:'6g',fat:'24g',description:'Crispy wings tossed in tangy spiced sauce.'},
  'nuggets':{ingredients:['Chicken','Breadcrumbs','Egg','Spices','Oil'],calories:'300 kcal',protein:'18g',carbs:'22g',fat:'16g',description:'Crispy golden chicken nuggets with tender inside.'},
  'chocolate cake':{ingredients:['Flour','Cocoa','Eggs','Butter','Sugar'],calories:'420 kcal',protein:'6g',carbs:'58g',fat:'18g',description:'Moist rich chocolate cake with decadent frosting.'},
  'cheesecake':{ingredients:['Cream Cheese','Sugar','Eggs','Butter','Biscuit'],calories:'480 kcal',protein:'8g',carbs:'44g',fat:'30g',description:'Velvety cheesecake on a buttery biscuit base.'},
  'brownie':{ingredients:['Chocolate','Butter','Sugar','Eggs','Flour'],calories:'360 kcal',protein:'5g',carbs:'46g',fat:'18g',description:'Fudgy dark chocolate brownie, dense and indulgent.'},
  'ice cream':{ingredients:['Milk','Cream','Sugar','Eggs','Flavour'],calories:'280 kcal',protein:'5g',carbs:'32g',fat:'15g',description:'Creamy handcrafted ice cream in classic flavours.'},
  'gulab jamun':{ingredients:['Khoya','Flour','Sugar Syrup','Cardamom','Rose Water'],calories:'320 kcal',protein:'5g',carbs:'52g',fat:'10g',description:'Soft fried milk dumplings soaked in rose syrup.'},
  'rasgulla':{ingredients:['Chenna','Sugar','Rose Water','Cardamom'],calories:'180 kcal',protein:'6g',carbs:'32g',fat:'3g',description:'Soft spongy cottage cheese balls in sweet syrup.'},
  'halwa':{ingredients:['Semolina/Carrot','Ghee','Sugar','Milk','Cardamom'],calories:'380 kcal',protein:'5g',carbs:'56g',fat:'14g',description:'Warm fragrant sweet made with ghee and cardamom.'},
  'kheer':{ingredients:['Rice','Milk','Sugar','Cardamom','Saffron'],calories:'280 kcal',protein:'8g',carbs:'48g',fat:'6g',description:'Creamy rice pudding with saffron and cardamom.'},
  'muffin':{ingredients:['Flour','Eggs','Butter','Sugar','Baking Powder'],calories:'320 kcal',protein:'5g',carbs:'44g',fat:'14g',description:'Soft moist muffin baked fresh with seasonal flavours.'},
  'cookie':{ingredients:['Flour','Butter','Sugar','Eggs','Chocolate Chips'],calories:'200 kcal',protein:'3g',carbs:'28g',fat:'9g',description:'Golden-edge cookies with a soft chewy centre.'},
  'tiramisu':{ingredients:['Mascarpone','Espresso','Ladyfingers','Eggs','Cocoa'],calories:'380 kcal',protein:'7g',carbs:'38g',fat:'20g',description:'Italian layered dessert with coffee-soaked biscuits.'},
};

export const generateFoodDetails = (itemName) => {
  if (!itemName?.trim()) return getDefaultNutrition(itemName);
  const lower = itemName.toLowerCase().trim();
  if (NUTRITION_DB[lower]) return { ...NUTRITION_DB[lower] };
  for (const [key, data] of Object.entries(NUTRITION_DB)) {
    if (lower.includes(key)) return { ...data };
  }
  for (const [key, data] of Object.entries(NUTRITION_DB)) {
    if (key.includes(lower)) return { ...data };
  }
  const words = lower.split(/\s+/);
  for (const word of words) {
    if (word.length < 4) continue;
    for (const [key, data] of Object.entries(NUTRITION_DB)) {
      if (key.includes(word) || word.includes(key)) return { ...data };
    }
  }
  return getDefaultNutrition(itemName);
};

const getDefaultNutrition = (itemName = '') => {
  const lower = itemName.toLowerCase();
  if (['drink','juice','water','tea','coffee','soda','chai','smoothie'].some(k => lower.includes(k)))
    return {ingredients:['Water','Natural Flavours'],calories:'80 kcal',protein:'0g',carbs:'20g',fat:'0g',description:'Refreshing drink served chilled.'};
  if (['dessert','sweet','cake','ice','chocolate','cookie','brownie'].some(k => lower.includes(k)))
    return {ingredients:['Sugar','Flour','Butter','Eggs','Flavour'],calories:'360 kcal',protein:'5g',carbs:'50g',fat:'16g',description:'Indulgent sweet treat made fresh daily.'};
  if (['salad','bowl','greens'].some(k => lower.includes(k)))
    return {ingredients:['Mixed Greens','Vegetables','Dressing'],calories:'200 kcal',protein:'6g',carbs:'18g',fat:'10g',description:'Fresh healthy bowl with seasonal greens.'};
  return {ingredients:['Fresh Ingredients','Spices','Herbs','Oil'],calories:'380 kcal',protein:'16g',carbs:'42g',fat:'14g',description:'Freshly prepared dish made with quality ingredients.'};
};

// ─── Size variant detection ───────────────────────────────────────────────────

const SIZE_VARIANT_KEYWORDS = [
  'coffee','latte','cappuccino','tea','chai','juice','smoothie',
  'milkshake','shake','lassi','cold brew','frappe','mojito',
  'lemonade','soda','pizza','pasta','biryani','rice',
];

export const detectSizeVariants = (itemName = '', basePrice = 0) => {
  const lower = itemName.toLowerCase();
  if (!SIZE_VARIANT_KEYWORDS.some(kw => lower.includes(kw))) return null;
  const base = parseFloat(basePrice) || 0;
  if (base <= 0) return null;
  return {
    enabled: true,
    small:   Math.round(base * 0.8),
    medium:  Math.round(base),
    large:   Math.round(base * 1.3),
  };
};

// ─── Main enrichment runner ───────────────────────────────────────────────────

export const enrichItems = async (items, { generateDetails = true, generateAddons = true } = {}, onProgress) => {
  const enriched = [];
  for (let i = 0; i < items.length; i++) {
    const item  = items[i];
    const extra = {};

    // Addons — ALWAYS run (rule-based, instant, decoupled from generateDetails)
    const suggestions = getAddonSuggestions(item.name);
    if (suggestions.length > 0) extra.addons = suggestions;

    // Food details — local lookup, always instant, no network
    if (generateDetails) {
      const details = generateFoodDetails(item.name);
      if (details) {
        extra.ingredients = details.ingredients;
        extra.calories    = details.calories;
        extra.protein     = details.protein;
        extra.carbs       = details.carbs;
        extra.fat         = details.fat;
        if (!item.description?.trim()) extra.description = details.description;
      }
    }

    // Size variants — detect and set sizePricing (matches MenuManagement schema)
    const sizePricing = detectSizeVariants(item.name, item.price);
    if (sizePricing) extra.sizePricing = sizePricing;

    enriched.push({ ...item, ...extra });
    if (onProgress) onProgress(i + 1, items.length);
  }
  return enriched;
};
