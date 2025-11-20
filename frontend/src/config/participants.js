export const makeEmptyGenderCounts = () => ({ men: 0, women: 0 });

export const ensureGenderCounts = (value = {}) => ({
  men: Number.isInteger(value.men) && value.men >= 0 ? value.men : 0,
  women: Number.isInteger(value.women) && value.women >= 0 ? value.women : 0,
});

export const GENDER_OPTIONS = [
  { value: 'men', label: 'Man' },
  { value: 'women', label: 'Kvinna' },
];

export const OFFER_STATUS = {
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
};

export const VISIT_TYPES = {
  GROUP: 'group',
  INDIVIDUAL: 'individual',
};

export const SATISFACTION_MIN = 1;
export const SATISFACTION_MAX = 6;
