export interface IngredientMeasure {
  readonly grams: number;
  readonly source: 'household_measure' | 'label_measure';
}

export interface IngredientRule {
  readonly aliases?: ReadonlyArray<string>;
  readonly countGrams?: number;
  readonly countSource?:
    'estimated_count' | 'household_measure' | 'label_measure';
  readonly foodCode: string;
  readonly gramsPerMillilitre?: number;
  readonly matchConfidence?: 'high' | 'low' | 'medium';
  readonly measures?: Readonly<Record<string, number | IngredientMeasure>>;
  readonly pattern?: RegExp;
  readonly volumeSource?: 'household_measure' | 'label_measure';
}

export const freshHerbMeasures = {
  bunch: 30,
  handful: 15,
  packet: 30,
  sprig: 1,
} as const;

// Ordered from specific to broad. Literal aliases are medium confidence;
// genuine approximations stay explicitly low.
export const everydayIngredientRules: ReadonlyArray<IngredientRule> = [
  approximation('13-876', /\bnando s(?: medium)? mix\b/u, {
    countGrams: 20,
    measures: { packet: 20 },
  }),
  approximation('13-876', /\b(?:garlic and herb|peri peri) chicken mix\b/u, {
    countGrams: 45,
    measures: { packet: 45 },
  }),
  approximation('13-876', /\bspicentice(?: mix| sachet)?\b/u, {
    countGrams: 30,
    measures: { packet: 30 },
  }),
  rule('reference-peppercorn-sauce', /\bpeppercorn sauce\b/u, {
    countGrams: 180,
    countSource: 'household_measure',
  }),
  rule('16-416', /\btuna in spring water\b/u),
  rule('11-888', /\bself raising flour\b/u),
  approximation('13-805', /\bmixed herb\b/u, {
    gramsPerMillilitre: 0.25,
  }),
  rule('11-1045', /\bcornflour\b/u, { gramsPerMillilitre: 0.55 }),
  rule('reference-coconut-flour', /\bcoconut flour\b/u, {
    gramsPerMillilitre: 0.5,
  }),
  rule(
    'heck-chicken-italia',
    /\b(?:chicken sausage|reduced fat sausage|heck reduced fat sausage)\b/u,
    {
      countGrams: 42.5,
      countSource: 'label_measure',
      matchConfidence: 'high',
    },
  ),
  rule('19-516', /\bchorizo sausage\b/u, {
    countGrams: 60,
    countSource: 'household_measure',
  }),
  rule('reference-raw-chicken-thigh', /\bchicken thigh\b/u, {
    countGrams: 100,
    countSource: 'household_measure',
  }),
  rule('11-718', /\bwholemeal (?:penne|pasta)\b/u),
  rule('16-492', /\bsmoked haddock\b/u),
  rule('17-705', /\b(?:barbecue|barbeque|bbq) sauce\b/u, {
    countGrams: 300,
    gramsPerMillilitre: 1.15,
  }),
  rule(
    '17-720',
    /\b(?:(?:massaman|red|green|thai red|thai green|tikka(?: masala)?) )?curry paste\b/u,
    {
      countGrams: 200,
      gramsPerMillilitre: 1.1,
    },
  ),
  approximation('17-720', /\btagine paste\b/u, {
    countGrams: 200,
    gramsPerMillilitre: 1.1,
  }),
  rule('reference-harissa', /\bharissa paste\b/u, {
    gramsPerMillilitre: 1.1,
  }),
  rule('reference-chipotle-paste', /\bchipotle paste\b/u, {
    gramsPerMillilitre: 1.1,
  }),
  rule('reference-hoisin-sauce', /\bhoisin(?: sauce)?\b/u, {
    gramsPerMillilitre: 1,
  }),
  rule('reference-mirin', /\bmirin\b/u, {
    gramsPerMillilitre: 1,
  }),
  rule('17-721', /\bfish sauce\b/u, { gramsPerMillilitre: 1.15 }),
  rule('17-719', /\b(?:chilli sauce|sriracha)\b/u, {
    gramsPerMillilitre: 1.1,
  }),
  approximation('17-719', /\bnando s (?:medium )?sauce\b/u, {
    gramsPerMillilitre: 1.1,
  }),
  rule('reference-ketjap-manis', /\bketjap mani(?:s)?\b/u, {
    gramsPerMillilitre: 1,
  }),
  rule('17-339', /\b(?:cider|rice|wine) vinegar\b/u, {
    countGrams: 15,
    gramsPerMillilitre: 1,
  }),
  rule('17-723', /\bwor(?:cester|chester)(?:shire)? sauce\b/u, {
    gramsPerMillilitre: 1.1,
  }),
  rule('17-709', /\bketchup\b/u, { gramsPerMillilitre: 1.15 }),
  rule('17-622', /\bpesto\b/u, { gramsPerMillilitre: 1.05 }),
  rule('17-654', /\bmayonnaise\b/u, { gramsPerMillilitre: 0.92 }),
  rule('17-365', /\bwholegrain mustard\b/u, { gramsPerMillilitre: 1 }),
  rule('17-364', /\b(?:dijon|english) mustard\b/u, {
    gramsPerMillilitre: 1,
  }),
  rule('17-362', /\bmustard powder\b/u, { gramsPerMillilitre: 0.55 }),
  rule('17-050', /\b(?:maple syrup|runny honey)\b/u, {
    gramsPerMillilitre: 1.35,
  }),
  rule('17-073', /\bjam\b/u),
  rule('17-755', /\b(?:glass )?white wine\b/u, {
    countGrams: 150,
    gramsPerMillilitre: 1,
  }),
  rule('17-752', /\bred wine\b/u, { gramsPerMillilitre: 1 }),
  rule('17-725', /\b(?:beef )?gravy\b/u, { gramsPerMillilitre: 1 }),
  rule('17-681', /\b(?:vegetable stock|stock cube|chicken stick)\b/u, {
    countGrams: 200,
    countSource: 'household_measure',
    gramsPerMillilitre: 1,
  }),
  rule('14-331', /\bapple juice\b/u, { gramsPerMillilitre: 1 }),
  rule('reference-coconut-water', /\bcoconut water\b/u, {
    gramsPerMillilitre: 1,
  }),
  rule('14-329', /\borange juice\b/u, { gramsPerMillilitre: 1 }),
  rule('17-377', /\bwater\b/u, { gramsPerMillilitre: 1 }),
  rule('reference-oat-drink', /\b(?:oat milk|oat drink)\b/u, {
    gramsPerMillilitre: 1,
  }),
  rule('reference-coconut-drink', /\b(?:coconut milk drink|coconut drink)\b/u, {
    gramsPerMillilitre: 1,
  }),
  rule(
    '12-379',
    /\b(?:0 fat |fat free |low fat )?(?:natural )?yog(?:urt|hurt)\b/u,
    {
      gramsPerMillilitre: 1.03,
    },
  ),
  rule('12-555', /\b(?:fat free |reduced fat )?greek yog(?:urt|hurt)\b/u, {
    gramsPerMillilitre: 1.03,
  }),
  rule(
    '12-336',
    /\b(?:half fat creme fraiche|low fat soured cream|reduced fat soured cream)\b/u,
    {
      gramsPerMillilitre: 1,
    },
  ),
  rule('12-335', /\b(?:creme fraiche|soured cream)\b/u, {
    gramsPerMillilitre: 1,
  }),
  rule('12-334', /\bdouble cream\b/u, { gramsPerMillilitre: 0.99 }),
  rule('12-332', /\b(?:single|low fat) cream\b/u, {
    gramsPerMillilitre: 1,
  }),
  rule('12-537', /\b(?:low fat )?cream cheese\b/u),
  rule('12-525', /\bfeta\b/u),
  rule('12-360', /\bmoz+ar+el+la\b/u, { measures: { packet: 125 } }),
  approximation('12-360', /\bpizza topping\b/u),
  rule('12-526', /\b(?:parmesan|pecorino)\b/u, {
    gramsPerMillilitre: 0.4,
  }),
  rule('12-176', /\bricotta(?: cheese)?\b/u),
  rule('12-938', /\begg white\b/u, {
    countGrams: 40,
    countSource: 'household_measure',
  }),
  rule('12-939', /\begg yolk\b/u, {
    countGrams: 20,
    countSource: 'household_measure',
  }),
  rule('18-290', /\b(?:chicken|chicken breast|chicken fillet)\b/u, {
    countGrams: 150,
  }),
  rule('19-510', /\bchipolata sausage\b/u, {
    countGrams: 31.25,
    countSource: 'household_measure',
  }),
  rule('19-510', /\bsausage\b/u, { countGrams: 60 }),
  rule(
    '18-508',
    /\b(?:5 beef mince|extra lean minced beef|lean mince|lean steak mince)\b/u,
  ),
  rule('18-508', /\blean minced beef\b/u),
  rule('18-469', /\bbeef burger\b/u, { countGrams: 150 }),
  rule(
    '18-468',
    /\b(?:lean beef|diced beef|frying steak|sliced roast beef|steak)\b/u,
    {
      countGrams: 200,
    },
  ),
  rule('18-468', /^(?:beef|roast beef)$/u),
  rule('18-012', /\bbeef brisket\b/u),
  rule('18-489', /\bduck breast(?: fillet)?\b/u),
  rule('19-646', /\b(?:bacon medallion|smoked bacon|rasher bacon)\b/u, {
    countGrams: 30,
    countSource: 'household_measure',
  }),
  rule('18-510', /\bpork fillet\b/u, {
    countGrams: 450,
    countSource: 'household_measure',
  }),
  rule('18-518', /\bpork loin\b/u),
  rule('18-606', /\bpork mince\b/u),
  rule('18-608', /\bpork\b/u),
  rule('18-475', /\b(?:diced lamb|stewing lamb|lamb cutlet)\b/u),
  rule('18-475', /^lamb$/u),
  approximation('18-349', /\b(?:sliced turkey|turkey meatball|turkey)\b/u),
  rule('16-356', /\bsalmon(?: fillet)?\b/u, {
    countGrams: 120,
    countSource: 'household_measure',
  }),
  rule('16-372', /\bcod(?: fillet)?\b/u, {
    countGrams: 150,
    countSource: 'household_measure',
    matchConfidence: 'high',
  }),
  rule('16-372', /\bwhite fish(?: fillet)?\b/u, {
    countGrams: 150,
    countSource: 'household_measure',
  }),
  rule('reference-sea-bass', /\bsea bass(?: fillet)?\b/u, {
    countGrams: 150,
  }),
  rule('16-375', /\bhaddock\b/u),
  rule('16-154', /\btilapia\b/u),
  rule('16-387', /\b(?:king )?prawn\b/u, { countGrams: 15 }),
  rule(
    '11-716',
    /\b(?:pasta|spaghetti|penne|farfalle|fettucine|tagliatelle)\b/u,
  ),
  approximation('11-941', /^noodle$/u),
  rule('11-716', /\bcannelloni tube\b/u, {
    countGrams: 20,
    countSource: 'household_measure',
  }),
  rule('11-902', /\bcooked couscous\b/u, { gramsPerMillilitre: 0.72 }),
  rule('11-901', /\bcouscous\b/u, { gramsPerMillilitre: 0.72 }),
  rule('11-878', /\barborio rice\b/u),
  rule(
    '11-869',
    /\b(?:cooked|microwave|pre cooked|precooked) brown (?:basmati )?rice\b/u,
  ),
  rule('11-866', /\bbrown basmati rice\b/u),
  rule('11-868', /\b(?:brown rice|wholemeal rice)\b/u),
  rule('11-868', /\brice wholemeal\b/u),
  rule(
    '11-884',
    /\b(?:microwave|pre cooked|precooked|tilda) (?:basmati )?rice\b/u,
    {
      countGrams: 250,
      countSource: 'household_measure',
      measures: { packet: 250 },
    },
  ),
  rule('11-884', /\brice pre cooked\b/u),
  rule('13-661', /\b(?:puy lentil|pre cooked lentil)\b/u, {
    gramsPerMillilitre: 0.85,
  }),
  rule('13-657', /\bred lentil\b/u, { gramsPerMillilitre: 0.8 }),
  rule('13-076', /\byellow split pea\b/u),
  rule('13-670', /\bchickpea\b/u, {
    countGrams: 240,
    countSource: 'household_measure',
    measures: { can: 240, tin: 240 },
  }),
  rule('13-666', /\bcann?ellini bean\b/u, {
    countGrams: 240,
    countSource: 'household_measure',
    measures: { can: 240, tin: 240 },
  }),
  rule('13-426', /\bbeansprout\b/u),
  rule('13-667', /\bedamame(?: bean)?\b/u),
  rule('13-143', /\bsugar snap pea\b/u),
  rule('13-122', /\bmangetout(?: pea)?\b/u),
  rule('13-516', /\bpak choi\b/u, {
    countGrams: 150,
    countSource: 'household_measure',
  }),
  rule('13-520', /\bbaby gem lettuce\b/u, {
    countGrams: 100,
    countSource: 'household_measure',
  }),
  rule('13-520', /\b(?:lettuce leaf|salad)\b/u, { countGrams: 100 }),
  rule('13-669', /\bwatercress\b/u),
  rule('13-521', /\b(?:frozen )?spinach\b/u),
  approximation('13-514', /\b(?:green veg|veg)\b/u),
  rule('13-624', /\bleek\b/u, {
    countGrams: 125,
    countSource: 'household_measure',
  }),
  rule('13-342', /\bshallot\b/u, { countGrams: 40 }),
  rule('13-355', /\bbutternut squash\b/u),
  rule('13-234', /\bkale\b/u),
  rule('13-502', /\b(?:broccoli|brocolli)(?: floret)?\b/u, {
    countGrams: 100,
  }),
  rule('13-527', /\b(?:garden )?pea\b/u),
  rule('reference-baby-corn', /\b(?:baby corn|baby sweetcorn)\b/u, {
    countGrams: 10,
    countSource: 'household_measure',
    measures: { packet: 175 },
  }),
  rule('13-622', /\bcorncob\b/u, {
    countGrams: 60,
    countSource: 'household_measure',
  }),
  rule('13-622', /\btinned sweetcorn\b/u, { countGrams: 60 }),
  rule('reference-bamboo-shoots', /\bbamboo shoot\b/u),
  rule('13-517', /\b(?:cherry|ripe) tomato\b/u, {
    countGrams: 20,
    countSource: 'household_measure',
  }),
  rule('14-378', /\bmango\b/u),
  rule('14-376', /\b(?:fresh |tinned )?pineapple\b/u),
  rule('14-388', /\bblackberr(?:y|ies)\b/u),
  rule('reference-mixed-berries', /\b(?:frozen fruit|mixed berr(?:y|ies))\b/u),
  rule('14-375', /\b(?:frozen |ripe )?raspberr(?:y|ies)\b/u),
  rule('14-324', /\bfrozen strawberr(?:y|ies)\b/u),
  rule('14-226', /\bpomegranate seed\b/u),
  rule('14-870', /\b(?:almond|blanched almond|toasted almond)\b/u),
  rule('14-874', /\bhazelnut\b/u, { gramsPerMillilitre: 0.6 }),
  approximation('14-892', /\b(?:peanut|almond|hazelnut) butter\b/u, {
    gramsPerMillilitre: 1.05,
  }),
  rule('14-839', /\bpine nut\b/u, { gramsPerMillilitre: 0.65 }),
  rule('14-837', /\bpecan\b/u, { gramsPerMillilitre: 0.6 }),
  rule('14-840', /\bpistachio\b/u),
  rule('14-842', /\bpumpkin seed\b/u, { gramsPerMillilitre: 0.6 }),
  rule('14-845', /\bsunflower seed\b/u, { gramsPerMillilitre: 0.62 }),
  rule('14-844', /\bsesame seed\b/u, { gramsPerMillilitre: 0.6 }),
  rule('14-811', /\b(?:toasted )?cashew\b/u),
  rule('14-879', /\bwalnut\b/u),
  rule('reference-chia-seeds', /\bchia seed\b/u, {
    gramsPerMillilitre: 0.65,
  }),
  rule('reference-flaxseed', /\bflax seed\b/u, {
    gramsPerMillilitre: 0.65,
  }),
  rule('reference-flaxseed', /\b(?:flaxseed|ground flaxseed)\b/u, {
    gramsPerMillilitre: 0.65,
  }),
  rule('reference-hemp-seed', /\bhemp seed\b/u, {
    gramsPerMillilitre: 0.65,
  }),
  rule('reference-amaranth-grain', /\bamaranth seed\b/u, {
    gramsPerMillilitre: 0.75,
  }),
  rule('14-878', /\broasted peanut\b/u),
  rule('14-031', /\bdried apricot\b/u),
  rule('14-394', /\bdate\b/u),
  rule('14-393', /\braisin\b/u),
  rule('14-318', /\bbanana\b(?! bread)/u, { countGrams: 120 }),
  rule('13-463', /\bsweet potato\b/u, { countGrams: 200 }),
  rule('14-319', /\b(?:granny smith |red )?apple\b/u, {
    countGrams: 150,
    countSource: 'household_measure',
  }),
  rule('11-970', /\bbagel\b/u, {
    countGrams: 90,
    countSource: 'household_measure',
  }),
  rule('11-985', /\b(?:burger bun|ciabatta roll)\b/u, {
    countGrams: 70,
    countSource: 'household_measure',
    matchConfidence: 'medium',
  }),
  rule('11-974', /\bflatbread\b/u, {
    countGrams: 70,
    countSource: 'household_measure',
  }),
  rule('11-974', /\bpitta bread\b/u, { countGrams: 70 }),
  rule('11-925', /\b(?:tortilla )?wrap\b/u, { countGrams: 60 }),
  rule('11-541', /\benglish muffin\b/u, {
    countGrams: 70,
    countSource: 'household_measure',
  }),
  rule(
    '11-1145',
    /\b(?:breadcrumb|crusty bread|sourdough bread|stale bread|thick white bread|thick slice stale bread|slice of toast|toast)\b/u,
    {
      countGrams: 40,
      countSource: 'household_measure',
      measures: { slice: 40, slices: 40 },
    },
  ),
  rule('11-886', /\b(?:all purpose |bread )?flour\b/u, {
    gramsPerMillilitre: 0.53,
  }),
  rule('12-545', /\b(?:cacao|coco|cocoa) powder\b/u, {
    gramsPerMillilitre: 0.45,
  }),
  rule('17-498', /\bdrinking chocolate(?: powder)?\b/u, {
    gramsPerMillilitre: 0.45,
  }),
  rule('17-491', /\bdark chocolate|dark chocolate chip\b/u),
  rule('17-648', /\bmilk chocolate chip\b/u),
  rule('17-063', /\b(?:brown|caster|golden caster) sugar\b/u, {
    gramsPerMillilitre: 0.85,
  }),
  rule('17-063', /\bcoconut sugar\b/u, {
    gramsPerMillilitre: 0.85,
  }),
  approximation('17-063', /\bstevia(?: sugar)?\b/u, {
    gramsPerMillilitre: 0.85,
  }),
  rule('11-001', /\barrow ?root(?: powder| starch)?\b/u, {
    gramsPerMillilitre: 0.6,
  }),
  rule('17-379', /\bactive dry yeast\b/u, { gramsPerMillilitre: 0.65 }),
  rule('11-788', /\bjumbo rolled oat\b/u),
  rule('17-041', /\bgroundnut oil\b/u, {
    countGrams: 14,
    gramsPerMillilitre: 0.91,
  }),
  rule('13-890', /\b(?:fresh root |thumb sized piece of )?ginger\b/u, {
    countGrams: 15,
    gramsPerMillilitre: 0.4,
    measures: { cm: 5 },
  }),
  rule('13-244', /\b(?:lazy )?garlic\b/u, {
    countGrams: 3,
    gramsPerMillilitre: 0.56,
    measures: { clove: 3 },
  }),
  rule('13-317', /\b(?:green|red) chill(?:i|y)\b/u, { countGrams: 15 }),
  rule('13-804', /\bbasil(?: leaf)?\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
    measures: freshHerbMeasures,
  }),
  rule('13-887', /\bchive\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
    measures: freshHerbMeasures,
  }),
  rule('13-888', /\b(?:fresh )?coriander(?: leaf)?\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
    measures: freshHerbMeasures,
  }),
  rule('13-824', /\bdill(?: frond)?\b/u, {
    gramsPerMillilitre: 0.07,
    measures: freshHerbMeasures,
  }),
  rule('13-836', /\b(?:chopped )?mint(?: leaf)?\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
    measures: freshHerbMeasures,
  }),
  rule('13-844', /\b(?:parsley|parsely)(?: leaf)?\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
    measures: freshHerbMeasures,
  }),
  rule('13-892', /\brosemary\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
    measures: freshHerbMeasures,
  }),
  rule('13-893', /\bthyme(?: leaf)?\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
    measures: freshHerbMeasures,
  }),
  rule('13-853', /\bsage\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
    measures: freshHerbMeasures,
  }),
  rule('reference-cajun-seasoning', /\bcajun(?: seasoning| spice)?\b/u, {
    gramsPerMillilitre: 0.45,
  }),
  rule('reference-jerk-seasoning', /\bjerk(?: seasoning| spice)?\b/u, {
    gramsPerMillilitre: 0.45,
  }),
  approximation(
    '13-876',
    /\b(?:mixed herb|italian herb|spicentice|peri peri|cottage pie|garlic and herb|chilli)(?: mix| seasoning| spice)?\b/u,
    {
      countGrams: 30,
      gramsPerMillilitre: 0.45,
    },
  ),
  approximation(
    '13-876',
    /\b(?:curry|curry powder|nando s (?:medium )?mix)\b/u,
    {
      countGrams: 30,
      gramsPerMillilitre: 0.45,
    },
  ),
  approximation(
    '13-876',
    /\b(?:allspice|anise|cardamom|cinnamon|cumin|coriander|fennel|five spice|onion granule|onion powder|oregano|paprika|peppercorn|saffron|turmeric)\b/u,
    {
      countGrams: 1,
      gramsPerMillilitre: 0.45,
    },
  ),
  approximation('13-876', /\bchilly\b/u, {
    countGrams: 1,
    gramsPerMillilitre: 0.45,
  }),
  rule('13-806', /\bbay leaf\b/u, {
    countGrams: 0.5,
    countSource: 'household_measure',
  }),
  rule('14-130', /\blemon(?: juice| zest| juice of| juice and zest)?\b/u, {
    countGrams: 58,
    gramsPerMillilitre: 1,
  }),
  rule('14-131', /\blime(?: juice| zest| juice of| juice and zest)?\b/u, {
    countGrams: 44,
    gramsPerMillilitre: 1,
  }),
  rule('14-327', /\borange(?: zest)?\b/u, {
    countGrams: 140,
    countSource: 'household_measure',
  }),
  rule('reference-lemongrass', /\blemongrass(?: paste| stalk)?\b/u, {
    countGrams: 12,
    countSource: 'household_measure',
    gramsPerMillilitre: 0.6,
  }),
  rule(
    '13-530',
    /\b(?:tomato passata|tin of (?:chopped )?tomato|tin of tomato|tin tomato)\b/u,
    {
      gramsPerMillilitre: 1,
    },
  ),
  rule('13-553', /\b(?:mashed potato|potato mash)\b/u, { countGrams: 400 }),
  approximation('14-843', /\b(?:pre cooked quinoa|quinoa pre cooked)\b/u),
  rule('12-346', /\breduced fat (?:cheddar )?cheese\b/u),
  rule('19-021', /\b(?:ham hock|thick cut ham|thick ham)\b/u, {
    countGrams: 40,
  }),
  rule('reference-prosciutto', /\bprosciutto\b/u, {
    countGrams: 14,
    countSource: 'label_measure',
  }),
  rule('17-043', /\btoasted sesame oil\b/u, {
    gramsPerMillilitre: 0.92,
  }),
  rule('14-265', /\btamarind paste\b/u, { gramsPerMillilitre: 1.2 }),
  rule('14-873', /\bdes+icated coconut\b/u, {
    gramsPerMillilitre: 0.35,
  }),
];

function rule(
  foodCode: string,
  pattern: RegExp,
  options: Omit<IngredientRule, 'foodCode' | 'pattern'> = {},
): IngredientRule {
  return { matchConfidence: 'medium', ...options, foodCode, pattern };
}

function approximation(
  foodCode: string,
  pattern: RegExp,
  options: Omit<IngredientRule, 'foodCode' | 'pattern'> = {},
): IngredientRule {
  return rule(foodCode, pattern, { ...options, matchConfidence: 'low' });
}
