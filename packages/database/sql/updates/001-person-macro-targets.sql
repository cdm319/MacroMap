alter table person
  add column target_kcal integer,
  add column target_protein_g numeric(7, 2),
  add column target_carbs_g numeric(7, 2),
  add column target_fat_g numeric(7, 2),
  add constraint person_macro_targets_complete check (
    num_nulls(
      target_kcal,
      target_protein_g,
      target_carbs_g,
      target_fat_g
    ) in (0, 4)
  ),
  add constraint person_target_kcal_positive check (
    target_kcal is null or target_kcal > 0
  ),
  add constraint person_target_macros_nonnegative check (
    target_protein_g is null or (
      target_protein_g >= 0 and target_carbs_g >= 0 and target_fat_g >= 0
    )
  );
