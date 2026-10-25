# Food database build, 2026-10-25

## Sources

- USDA FNDDS: 5432 rows (survey_fndds_food 5432), 0 with nutrients, 5395 with portions → 0 foods
- USDA Foundation: 87990 rows (sample_food 4079, market_acquisition 7577, sub_sample_food 75055, foundation_food 469, agricultural_acquisition 810), 4822 with nutrients, 2318 with portions → 378 foods
- USDA SR Legacy: 7793 rows (sr_legacy_food 7793), 7793 with nutrients, 7533 with portions → 7793 foods
- CIQUAL: no spreadsheet downloaded
- CoFID:
  - sheet "1.3 Proximates" (2890 rows); top rows:
    | Food Code | Food Name | Description | Group | Previous | Main data references | Footnote | Water (g) | Total nitrogen (g) | Protein (g) | Fat (g) | Carbohydrate (g) | Energy (kcal) (kcal) | Energy (kJ) (kJ)
    |  |  |  |  |  |  |  | WATER | TOTNIT | PROT | FAT | CHO | KCALS | KJ
    |  |  |  |  |  |  |  | Water | Total nitrogen | Protein | Fat | Carbohydrate | kcal | kJ
    | 13-145 | Ackee, canned, drained | 8 cans | DG | 554 | MW4, 1978; and Vegetables, H |  | 76.7 | 0.46 | 2.9 | 15.2 | 0.8 | 151 | 625
    | 13-146 | Agar, dried | Literature sources | DG |  | Wu Leung et al. (1972) Food  |  | 9.7 | 0.26 | 1.3 | 1.2 | Tr | 16 | 67
    | 13-147 | Agar, dried, soaked and drai | Literature sources | DG |  | Wu Leung et al. (1972) Food  |  | 84.2 | 0.03 | 0.2 | 0.1 | Tr | 2 | 7
    | 13-148 | Alfalfa sprouts, raw | Analytical and literature so | DG |  | Vegetables, Herbs and Spices |  | 93.4 | 0.64 | 4.0 | 0.7 | 0.4 | 24 | 100
    | 13-801 | Allspice, ground | Literature sources | H |  | Marsh et al. (1977) Composit |  | 8.5 | 0.98 | 6.1 | 8.7 | N | N | N
  - header row 1, columns {"name":1,"kcal":12,"p":9,"f":10,"c":11}
- CoFID: 2854 foods
- Japan:
  - sheet "Table" (2197 rows); top rows:
    | STANDARD TABLES OF FOOD COMP |  |  |  |  |  |  |  |  |  |  |  |  | 
    | Table: Standard tables of fo |  |  |  |  |  |  |  |  |  |  |  |  | 
    |  |  |  |  |  |  |  | Proximates | Proximates |  | Proximates |  |  | 
    | Food Group | Item No. | Index No. | Food and Description | Refuse | Energy (kcal) | Energy (kJ) | Water | Protein, calculated from ref | Protein, calculated as the s | Lipid | Fatty acid, triacyl-glycerol | Fatty acid, saturated | Fatty acid, mono-unsaturated
    |  |  |  | Tagnames | REFUSE | ENERC_ KCAL | ENERC | WATER | － | PROTCAA | － | FATNLEA | FASAT | FAMS
    |  |  |  | Unit | % | kcal/100 g | kJ/100 g | g/100 g | g/100 g | g/100 g | g/100 g | g/100 g | g/100 g | g/100 g
    | 01 | 01001 | 1 | Amaranth, whole grain, raw | 0 | 358 | 1498 | 13.5 | 12.7 | (12.5) | 6.0 | 5.0 | 1.18 | 1.48
    | 01 | 01002 | 2 | Foxtail millet, milled grain | 0 | 367 | 1538 | 13.3 | 11.2 | 10.0 | 4.4 | 4.1 | 0.67 | 0.52
  - header row 4, columns {"name":3,"kcal":5,"p":8,"f":10,"c":16}
- Japan: 2192 foods

## Result

13075 foods, 1.24 MB: us 8032, fr 0, uk 2852, jp 2191

Samples:
- ["Agutuk, fish with shortening (Alaskan ice cream) (Alaska Native)","us",470,9,43.5,10.5,[]]
- ["APPLEBEE'S, KRAFT, Macaroni & Cheese, from kid's menu","us",143,5,4.3,21.1,[["1 cup",124],["1 serving",180]]]
- ["Babyfood, banana apple dessert, strained","us",68,0.3,0.2,16.3,[["1 tbsp",15],["1 jar NFS",113],["1 jar Gerber Second Food (4 oz)",113]]]
- ["Babyfood, dinner, vegetables and turkey, junior","us",53,1.7,1.7,7.6,[["1 cup",256],["1 tbsp",16],["1 oz",28.4],["1 jar",170],["1 jar Gerber Third Foods (6 oz)",170]]]
- ["Almonds, whole kernels","uk",554,21.2,49.9,5.3,[]]
- ["Bass, sea, flesh only, baked","uk",154,23.2,6.8,0,[]]
- ["Beef, mince, extra lean, stewed","uk",137,24.7,4.2,0,[]]
- ["Bhaji, spinach and potato, homemade","uk",192,3.6,14.1,13.4,[]]
- ["\"Mugi-cha\" (roasted barley tea), infusion","jp",1,0,0,0.3,[]]
- ["Bananas, dried","jp",299,3.8,0.4,78.5,[]]
- ["Beef, Japanese beef cattle, chuck roll, Lean and fat, raw","jp",411,13.8,37.4,0.2,[]]
- ["Bun with filling, baked bun with custard cream filling, regular","jp",305,10.3,10.9,41.4,[]]
