# CoFID 2021 data

`../cofid-2021-data.ts` contains the 2,853 rows from the official 2021 CoFID
`1.3 Proximates` worksheet that have complete kcal, protein, carbohydrate, and
fat values.

Source:
https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid

Workbook SHA-256:
`436e9445ef2adb2a75f3d7edd51302de3adad25385f9795fc94ba58bd030e97d`

Only the food code, food name, and four required nutrients per 100g are kept.
Numeric values are stored as hundredths. CoFID's `Tr` trace marker is stored as
zero; rows containing `N` or a missing value for any required nutrient are
excluded. The runtime uses no spreadsheet parser.

Contains public sector information licensed under the Open Government Licence
v3.0: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/
