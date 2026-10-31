-- Default compatibility rules. MUST be reviewed by a clinician before production.
-- whole_blood: red-cell compatibility (O- universal donor).
-- plasma:      reverse ABO (AB universal plasma donor); Rh ignored.
-- platelets:   ABO-identical only; Rh- recipients get Rh- donors (conservative default).

with groups(g, abo, rh) as (
  values ('O-','O','-'),('O+','O','+'),('A-','A','-'),('A+','A','+'),
         ('B-','B','-'),('B+','B','+'),('AB-','AB','-'),('AB+','AB','+')
),
pairs as (
  select r.g as recipient, r.abo as r_abo, r.rh as r_rh,
         d.g as donor,     d.abo as d_abo, d.rh as d_rh
  from groups r cross join groups d
)
insert into compatibility_rules (component, recipient_group, donor_group)
select 'whole_blood', recipient, donor from pairs
where (d_abo = 'O' or d_abo = r_abo or r_abo = 'AB')
  and (d_rh = '-' or r_rh = '+')
union all
select 'plasma', recipient, donor from pairs
where (d_abo = 'AB' or d_abo = r_abo or r_abo = 'O')
union all
select 'platelets', recipient, donor from pairs
where d_abo = r_abo and (d_rh = '-' or r_rh = '+');
