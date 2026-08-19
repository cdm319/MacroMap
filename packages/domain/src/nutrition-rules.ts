export interface IngredientMeasure {
  readonly grams: number;
  readonly source: 'household_measure' | 'label_measure';
}

export interface IngredientRule {
  readonly aliases?: ReadonlyArray<string>;
  readonly countGrams?: number;
  readonly countSource?: 'estimated_count' | 'label_measure';
  readonly foodCode: string;
  readonly gramsPerMillilitre?: number;
  readonly matchConfidence?: 'high' | 'low' | 'medium';
  readonly measures?: Readonly<Record<string, number | IngredientMeasure>>;
  readonly pattern?: RegExp;
  readonly volumeSource?: 'household_measure' | 'label_measure';
}

// Ordered from specific to broad. These are ordinary UK ingredient equivalents,
// not recipe-specific mappings. Pattern matches remain visible as low-confidence
// provenance unless the rule declares otherwise.
export const everydayIngredientRules: ReadonlyArray<IngredientRule> = [
  rule(
    '13-876',
    /\b(?:cajun chicken|garlic and herb chicken|peri peri chicken|nando s(?: medium)?|old el paso chilli|spicentice)(?: mix| sachet)\b/u,
    { countGrams: 30, measures: { packet: 30 } },
  ),
  rule('17-677', /\bpeppercorn sauce\b/u, { countGrams: 150 }),
  rule('16-416', /\btuna in spring water\b/u),
  rule('11-888', /\bself raising flour\b/u),
  rule('13-805', /\bmixed herb\b/u, { gramsPerMillilitre: 0.25 }),
  rule('11-1045', /\bcornflour\b/u, { gramsPerMillilitre: 0.55 }),
  rule('14-873', /\bcoconut flour\b/u, { gramsPerMillilitre: 0.5 }),
  rule(
    '19-658',
    /\b(?:chicken sausage|reduced fat sausage|heck reduced fat sausage)\b/u,
    {
      countGrams: 60,
    },
  ),
  rule('19-516', /\bchorizo sausage\b/u, { countGrams: 60 }),
  rule('18-319', /\bchicken thigh\b/u, { countGrams: 100 }),
  rule('11-718', /\bwholemeal (?:penne|pasta)\b/u),
  rule('16-492', /\bsmoked haddock\b/u),
  rule('17-705', /\b(?:barbecue|barbeque|bbq) sauce\b/u, {
    countGrams: 300,
    gramsPerMillilitre: 1.15,
  }),
  rule('17-720', /\b(?:curry|harissa|tagine|tikka) paste\b/u, {
    countGrams: 200,
    gramsPerMillilitre: 1.1,
  }),
  rule('17-720', /\bchipotle paste\b/u, { gramsPerMillilitre: 1.1 }),
  rule('17-705', /\b(?:hoisin(?: sauce)?|mirin)\b/u, {
    gramsPerMillilitre: 1.1,
  }),
  rule('17-721', /\bfish sauce\b/u, { gramsPerMillilitre: 1.15 }),
  rule('17-719', /\b(?:chilli sauce|sriracha|nando s (?:medium )?sauce)\b/u, {
    gramsPerMillilitre: 1.1,
  }),
  rule('17-721', /\b(?:ketjap mani(?:s)?|soy sauce)\b/u, {
    gramsPerMillilitre: 1.16,
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
    gramsPerMillilitre: 1,
  }),
  rule('14-331', /\b(?:coconut water|apple juice)\b/u, {
    gramsPerMillilitre: 1,
  }),
  rule('14-329', /\borange juice\b/u, { gramsPerMillilitre: 1 }),
  rule('17-377', /\bwater\b/u, { gramsPerMillilitre: 1 }),
  rule('12-313', /\b(?:milk|oat milk|coconut milk drink)\b/u, {
    gramsPerMillilitre: 1.03,
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
  rule('12-360', /\bmoz+ar+el+la\b/u),
  rule('12-360', /\bpizza topping\b/u),
  rule('12-526', /\b(?:parmesan|pecorino)\b/u, {
    gramsPerMillilitre: 0.4,
  }),
  rule('12-176', /\bricotta(?: cheese)?\b/u),
  rule('12-937', /\begg white|egg yolk\b/u, { countGrams: 35 }),
  rule('18-290', /\b(?:chicken|chicken breast|chicken fillet)\b/u, {
    countGrams: 150,
  }),
  rule('19-510', /\b(?:sausage|chipolata sausage)\b/u, { countGrams: 60 }),
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
  }),
  rule('18-510', /\bpork fillet\b/u, { countGrams: 150 }),
  rule('18-518', /\bpork loin\b/u),
  rule('18-606', /\bpork mince\b/u),
  rule('18-608', /\bpork\b/u),
  rule('18-475', /\b(?:diced lamb|stewing lamb|lamb cutlet)\b/u),
  rule('18-475', /^lamb$/u),
  rule('18-349', /\b(?:turkey breast|sliced turkey|turkey meatball|turkey)\b/u),
  rule('16-356', /\bsalmon(?: fillet)?\b/u, { countGrams: 120 }),
  rule('16-372', /\b(?:cod|white fish|sea bass)(?: fillet)?\b/u, {
    countGrams: 150,
  }),
  rule('16-375', /\bhaddock\b/u),
  rule('16-154', /\btilapia\b/u),
  rule('16-387', /\b(?:king )?prawn\b/u, { countGrams: 15 }),
  rule(
    '11-716',
    /\b(?:pasta|spaghetti|penne|farfalle|fettucine|tagliatelle)\b/u,
  ),
  rule('11-941', /^noodle$/u),
  rule('11-716', /\bcannelloni tube\b/u, { countGrams: 20 }),
  rule('11-902', /\bcooked couscous\b/u, { gramsPerMillilitre: 0.72 }),
  rule('11-901', /\bcouscous\b/u, { gramsPerMillilitre: 0.72 }),
  rule('11-878', /\barborio rice\b/u),
  rule('11-866', /\bbrown basmati rice\b/u),
  rule('11-868', /\b(?:brown rice|wholemeal rice)\b/u),
  rule('11-868', /\brice wholemeal\b/u),
  rule(
    '11-884',
    /\b(?:microwave|pre cooked|precooked|tilda) (?:basmati )?rice\b/u,
    {
      countGrams: 250,
    },
  ),
  rule('11-884', /\brice pre cooked\b/u),
  rule('13-661', /\b(?:puy lentil|pre cooked lentil)\b/u, {
    gramsPerMillilitre: 0.85,
  }),
  rule('13-657', /\bred lentil\b/u, { gramsPerMillilitre: 0.8 }),
  rule('13-076', /\byellow split pea\b/u),
  rule('13-670', /\bchickpea\b/u, { countGrams: 240 }),
  rule('13-666', /\bcann?ellini bean\b/u, { countGrams: 240 }),
  rule('13-426', /\bbeansprout\b/u),
  rule('13-667', /\bedamame(?: bean)?\b/u),
  rule('13-143', /\bsugar snap pea\b/u),
  rule('13-122', /\bmangetout(?: pea)?\b/u),
  rule('13-516', /\bpak choi\b/u, { countGrams: 150 }),
  rule('13-520', /\b(?:baby gem lettuce|lettuce leaf|salad)\b/u, {
    countGrams: 100,
  }),
  rule('13-669', /\bwatercress\b/u),
  rule('13-521', /\b(?:frozen )?spinach\b/u),
  rule('13-514', /\b(?:green veg|veg)\b/u),
  rule('13-624', /\bleek\b/u, { countGrams: 125 }),
  rule('13-342', /\bshallot\b/u, { countGrams: 40 }),
  rule('13-355', /\bbutternut squash\b/u),
  rule('13-234', /\bkale\b/u),
  rule('13-502', /\b(?:broccoli|brocolli)(?: floret)?\b/u, {
    countGrams: 100,
  }),
  rule('13-527', /\b(?:garden )?pea\b/u),
  rule('13-622', /\b(?:baby corn|baby sweetcorn|corncob|tinned sweetcorn)\b/u, {
    countGrams: 60,
  }),
  rule('13-426', /\bbamboo shoot\b/u),
  rule('13-517', /\b(?:cherry|ripe) tomato\b/u, { countGrams: 20 }),
  rule('14-378', /\bmango\b/u),
  rule('14-376', /\b(?:fresh |tinned )?pineapple\b/u),
  rule('14-388', /\bblackberr(?:y|ies)\b/u),
  rule('14-388', /\b(?:frozen fruit|mixed berr(?:y|ies))\b/u),
  rule('14-375', /\b(?:frozen |ripe )?raspberr(?:y|ies)\b/u),
  rule('14-324', /\bfrozen strawberr(?:y|ies)\b/u),
  rule('14-226', /\bpomegranate seed\b/u),
  rule('14-870', /\b(?:almond|blanched almond|toasted almond)\b/u),
  rule('14-874', /\bhazelnut\b/u, { gramsPerMillilitre: 0.6 }),
  rule('14-892', /\b(?:peanut|almond|hazelnut) butter\b/u, {
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
  rule('14-845', /\b(?:chia|flax|hemp) seed\b/u, {
    gramsPerMillilitre: 0.65,
  }),
  rule('14-845', /\b(?:flaxseed|ground flaxseed)\b/u, {
    gramsPerMillilitre: 0.65,
  }),
  rule('14-843', /\bamaranth seed\b/u, { gramsPerMillilitre: 0.75 }),
  rule('14-878', /\broasted peanut\b/u),
  rule('14-031', /\bdried apricot\b/u),
  rule('14-394', /\bdate\b/u),
  rule('14-393', /\braisin\b/u),
  rule('14-318', /\bbanana\b(?! bread)/u, { countGrams: 120 }),
  rule('13-463', /\bsweet potato\b/u, { countGrams: 200 }),
  rule('14-319', /\b(?:granny smith |red )?apple\b/u, { countGrams: 150 }),
  rule('11-970', /\bbagel\b/u, { countGrams: 90 }),
  rule('11-985', /\b(?:burger bun|ciabatta roll)\b/u, { countGrams: 70 }),
  rule('11-974', /\b(?:flatbread|pitta bread)\b/u, { countGrams: 70 }),
  rule('11-925', /\b(?:tortilla )?wrap\b/u, { countGrams: 60 }),
  rule('11-541', /\benglish muffin\b/u, { countGrams: 70 }),
  rule(
    '11-1145',
    /\b(?:breadcrumb|crusty bread|sourdough bread|stale bread|thick white bread|thick slice stale bread|slice of toast|toast)\b/u,
    { countGrams: 40 },
  ),
  rule('11-886', /\b(?:all purpose |bread )?flour\b/u, {
    gramsPerMillilitre: 0.53,
  }),
  rule('12-545', /\b(?:cacao|coco|cocoa|drinking chocolate) powder\b/u, {
    gramsPerMillilitre: 0.45,
  }),
  rule('12-545', /\bdrinking chocolate\b/u, { gramsPerMillilitre: 0.45 }),
  rule('17-491', /\bdark chocolate|dark chocolate chip\b/u),
  rule('17-648', /\bmilk chocolate chip\b/u),
  rule('17-063', /\b(?:brown|caster|coconut|golden caster|stevia) sugar\b/u, {
    gramsPerMillilitre: 0.85,
  }),
  rule('17-063', /\bstevia\b/u, { gramsPerMillilitre: 0.85 }),
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
  }),
  rule('13-887', /\bchive\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
  }),
  rule('13-888', /\b(?:fresh )?coriander(?: leaf)?\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
  }),
  rule('13-824', /\bdill(?: frond)?\b/u, { gramsPerMillilitre: 0.07 }),
  rule('13-836', /\b(?:chopped )?mint(?: leaf)?\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
  }),
  rule('13-844', /\b(?:parsley|parsely)(?: leaf)?\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
  }),
  rule('13-892', /\brosemary\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
  }),
  rule('13-893', /\bthyme(?: leaf)?\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
  }),
  rule('13-853', /\bsage\b/u, {
    countGrams: 5,
    gramsPerMillilitre: 0.07,
  }),
  rule(
    '13-876',
    /\b(?:cajun|jerk|mixed herb|italian herb|spicentice|peri peri|cottage pie|garlic and herb|chilli)(?: mix| seasoning| spice)?\b/u,
    {
      countGrams: 30,
      gramsPerMillilitre: 0.45,
    },
  ),
  rule('13-876', /\b(?:curry|curry powder|nando s (?:medium )?mix)\b/u, {
    countGrams: 30,
    gramsPerMillilitre: 0.45,
  }),
  rule(
    '13-876',
    /\b(?:allspice|anise|cardamom|cinnamon|cumin|coriander|fennel|five spice|onion granule|onion powder|oregano|paprika|peppercorn|saffron|turmeric)\b/u,
    {
      countGrams: 1,
      gramsPerMillilitre: 0.45,
    },
  ),
  rule('13-876', /\bchilly\b/u, {
    countGrams: 1,
    gramsPerMillilitre: 0.45,
  }),
  rule('13-806', /\bbay leaf\b/u, { countGrams: 0.5 }),
  rule('14-130', /\blemon(?: juice| zest| juice of| juice and zest)?\b/u, {
    countGrams: 58,
    gramsPerMillilitre: 1,
  }),
  rule('14-131', /\blime(?: juice| zest| juice of| juice and zest)?\b/u, {
    countGrams: 44,
    gramsPerMillilitre: 1,
  }),
  rule('14-327', /\borange(?: zest)?\b/u, { countGrams: 140 }),
  rule('13-890', /\blemongrass(?: paste| stalk)?\b/u, {
    countGrams: 12,
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
  rule('14-843', /\b(?:pre cooked quinoa|quinoa pre cooked)\b/u),
  rule('12-346', /\breduced fat (?:cheddar )?cheese\b/u),
  rule('19-021', /\b(?:ham hock|thick cut ham|thick ham)\b/u, {
    countGrams: 40,
  }),
  rule('19-646', /\bprosciutto\b/u, { countGrams: 15 }),
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
  options: Omit<
    IngredientRule,
    'foodCode' | 'matchConfidence' | 'pattern'
  > = {},
): IngredientRule {
  return { foodCode, pattern, ...options, matchConfidence: 'low' };
}
