// Central definitions for participant categories and labels

export const PARTICIPANT_KEYS = ['boende', 'trygghetsboende', 'externa', 'nya'];

export const PARTICIPANT_LABELS = {
  boende: 'Äldreboende',
  trygghetsboende: 'Trygghetsboende',
  externa: 'Externa',
  nya: 'Nya',
};

export const makeEmptyParticipants = () =>
  PARTICIPANT_KEYS.reduce((acc, key) => {
    acc[key] = { men: 0, women: 0 };
    return acc;
  }, {});

export const ensureParticipantsShape = (obj = {}) => {
  const base = makeEmptyParticipants();
  const result = { ...base };
  PARTICIPANT_KEYS.forEach((k) => {
    const v = obj[k] || {};
    result[k] = {
      men: Number.isInteger(v.men) && v.men >= 0 ? v.men : 0,
      women: Number.isInteger(v.women) && v.women >= 0 ? v.women : 0,
    };
  });
  return result;
};

