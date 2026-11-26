-- The light theme's grays are now a whiter neutral gray; product and category picture backgrounds that were stored with the
-- old blue-grey or pale green tints follow.
update public.categories set tint = case tint when '#E3F0EC' then '#EEEFF1' when '#EDF5F2' then '#F4F5F6' when '#E8EEF5' then '#EEEFF1' when '#F5F7FA' then '#F6F6F7' else tint end
where tint in ('#E3F0EC', '#EDF5F2', '#E8EEF5', '#F5F7FA');
update public.products set tint = case tint when '#E3F0EC' then '#EEEFF1' when '#EDF5F2' then '#F4F5F6' when '#E8EEF5' then '#EEEFF1' when '#F5F7FA' then '#F6F6F7' else tint end
where tint in ('#E3F0EC', '#EDF5F2', '#E8EEF5', '#F5F7FA');
