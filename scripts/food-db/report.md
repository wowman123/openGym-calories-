# Food database build, 2026-10-25

## Downloads

```
ok   survey.zip 3.2M Zip archive data, at least v1.0 to extract, compression meth
ok   foundation.zip 3.7M Zip archive data, at least v1.0 to extract, compression meth
ok   sr.zip 5.8M Zip archive data, at least v1.0 to extract, compression meth
FAIL ciqual-en.xls <- https://ciqual.anses.fr/cms/sites/default/files/inline-files/Table%20Ciqual%202020_ENG_2020%2007%2007.xls
     dataverse: 666252	alim_2025_11_03.xml
     dataverse: 666250	alim_grp_2025_11_03.xml
     dataverse: 666249	compo_2025_11_03.xml
     dataverse: 666246	const_2025_11_03.xml
     dataverse: 666248	sources_2025_11_03.xml
     dataverse: 666748	Table Ciqual 2025 doc FR_2025_11_19.pdf
     dataverse: 666245	Table Ciqual 2025_FR_2025_11_03.xls
     dataverse: 666260	Table Ciqual 2025_FR_2025_11_03.xlsx
ok   ciqual-dv-Table_Ciqual_2025_FR_2025_11_03.xls_ 4.3M Composite Document File V2 Document, Little Endian, Os: Wind
ok   ciqual-dv-Table_Ciqual_2025_FR_2025_11_03.xlsx_ 1.5M Microsoft Excel 2007+
FAIL ciqual-a.xls <- https://www.data.gouv.fr/api/1/datasets/r/bcdb7fec-875c-42aa-ba6e-460adf97aad3
FAIL ciqual-b.xls <- https://www.data.gouv.fr/api/1/datasets/r/f844ae25-6cbf-4027-930c-6a62459b8d42
ok   cofid.xlsx 4.5M Microsoft Excel 2007+
ok   japan.xlsx 892K Microsoft Excel 2007+
```

## Sources

- USDA FNDDS files: Download API Field Descriptions.xlsx, fndds_derivation.csv, food.csv, food_attribute.csv, food_attribute_type.csv, food_nutrient.csv, food_portion.csv, food_update_log_entry.csv, input_food.csv, measure_unit.csv, nutrient.csv, survey_fndds_food.csv, wweia_food_category.csv
  food_nutrient.csv: 353015 rows, columns id,fdc_id,nutrient_id,amount,data_points,derivation_id,min,max,median,footnote,min_year_acquired; ids seen: 203,204,205,208,221,255,262,263,269,291,301,303,304,305,306,307,309,312,317,319,320,321,322,323,328,334,337,338,401,404
- USDA FNDDS: 5432 rows (survey_fndds_food 5432), 5431 with nutrients, 5395 with portions → 5431 foods
- USDA Foundation files: Download API Field Descriptions.xlsx, acquisition_samples.csv, agricultural_samples.csv, food.csv, food_attribute.csv, food_attribute_type.csv, food_calorie_conversion_factor.csv, food_category.csv, food_component.csv, food_nutrient.csv, food_nutrient_conversion_factor.csv, food_portion.csv, food_protein_conversion_factor.csv, food_update_log_entry.csv, foundation_food.csv, input_food.csv, lab_method.csv, lab_method_code.csv, lab_method_nutrient.csv, market_acquisition.csv, measure_unit.csv, nutrient.csv, sample_food.csv, sub_sample_food.csv, sub_sample_result.csv
  food_nutrient.csv: 170469 rows, columns id,fdc_id,nutrient_id,amount,data_points,derivation_id,min,max,median,footnote,min_year_acquired; ids seen: 1002,1003,1004,1005,1007,1008,1009,1010,1011,1012,1013,1014,1024,1032,1039,1041,1043,1044,1050,1051,1062,1063,1071,1075,1076,1077,1079,1082,1084,1085
- USDA Foundation: 87990 rows (sample_food 4079, market_acquisition 7577, sub_sample_food 75055, foundation_food 469, agricultural_acquisition 810), 4822 with nutrients, 2318 with portions → 378 foods
- USDA SR Legacy files: Download & API Field Descriptions-2019-10-11-16-22.xlsx, all_downloaded_table_record_counts.csv, food.csv, food_attribute.csv, food_attribute_type.csv, food_calorie_conversion_factor.csv, food_category.csv, food_nutrient.csv, food_nutrient_conversion_factor.csv, food_nutrient_derivation.csv, food_nutrient_source.csv, food_portion.csv, food_protein_conversion_factor.csv, food_update_log_entry.csv, measure_unit.csv, nutrient.csv, retention_factor.csv, sr_legacy_food.csv
  food_nutrient.csv: 644125 rows, columns id,fdc_id,nutrient_id,amount,data_points,derivation_id,min,max,median,footnote,min_year_acquired; ids seen: 1003,1004,1005,1007,1008,1009,1010,1011,1012,1013,1014,1018,1051,1057,1058,1062,1075,1079,1087,1089,1090,1091,1092,1093,1095,1098,1099,1101,1103,1104
- USDA SR Legacy: 7793 rows (sr_legacy_food 7793), 7793 with nutrients, 7533 with portions → 7793 foods
- CIQUAL files: none
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

18401 foods, 1.99 MB: us 13358, fr 0, uk 2852, jp 2191

Samples:
- ["Agave liquid sweetener","us",310,0.1,0.5,76.4,[["Typical serving",20],["1 tablespoon",20],["Guideline amount per fl oz of beverage",3.5]]]
- ["Almond milk, unsweetened, plain, refrigerated","us",19,0.7,1.6,0.7,[]]
- ["Apricots, dehydrated (low-moisture), sulfured, uncooked","us",320,4.9,0.6,82.9,[["1 cup",119]]]
- ["Baby Toddler cereal, oatmeal, ready-to-eat","us",76,2.5,1.3,13.8,[["1 pouch",110],["1 jar / tub",110],["Typical serving",110],["1 tablespoon",15]]]
- ["Almonds, whole kernels","uk",554,21.2,49.9,5.3,[]]
- ["Bass, sea, flesh only, baked","uk",154,23.2,6.8,0,[]]
- ["Beef, mince, extra lean, stewed","uk",137,24.7,4.2,0,[]]
- ["Bhaji, spinach and potato, homemade","uk",192,3.6,14.1,13.4,[]]
- ["\"Mugi-cha\" (roasted barley tea), infusion","jp",1,0,0,0.3,[]]
- ["Bananas, dried","jp",299,3.8,0.4,78.5,[]]
- ["Beef, Japanese beef cattle, chuck roll, Lean and fat, raw","jp",411,13.8,37.4,0.2,[]]
- ["Bun with filling, baked bun with custard cream filling, regular","jp",305,10.3,10.9,41.4,[]]
