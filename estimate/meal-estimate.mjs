export const SAMPLE_TEXT = 'One medium pear';
export const MAX_PHOTO_BYTES = 5_000_000;
const photoTypes = new Set(['image/jpeg','image/png','image/webp']);
const macroKeys = new Set(['protein_g','carbs_g','fat_g','fibre_g']);
const groupKeys = new Set(['vegetables','fruit','grains','protein','dairy','added_fats_oils','supplements','discretionary']);
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const bounded = (value,max) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const totals = values => Object.values(values).reduce((sum,n) => sum+n, 0);

function validateRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 20) throw new TypeError('Expected 1–20 entries');
  return rows.map(row => {
    if (!isObject(row) || Object.keys(row).some(key=>!['description','kj','time','macros','groups'].includes(key)) ||
        typeof row.description !== 'string' || !row.description.trim() || row.description.trim().length > 400 || !bounded(row.kj,83680)) {
      throw new TypeError('Invalid estimate entry');
    }
    if (row.time !== undefined && (typeof row.time !== 'string' || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(row.time))) throw new TypeError('Invalid time');
    for (const [key,keys,max] of [['macros',macroKeys,5000],['groups',groupKeys,83680]]) {
      if (row[key] !== undefined && (!isObject(row[key]) || Object.entries(row[key]).some(([name,value])=>!keys.has(name)||!bounded(value,max)))) {
        throw new TypeError('Invalid '+key);
      }
    }
    if (row.groups && totals(row.groups) > row.kj + 1e-9) throw new TypeError('Group energy exceeds total');
    return {...row,description:row.description.trim()};
  });
}

// The caller owns transport, authentication, privacy and rate controls. This boundary does not save food.
export async function estimateMeal(input, provider, {signal}={}) {
  signal?.throwIfAborted();
  if (!isObject(input)) throw new TypeError('Meal input is required');
  let request;
  if (input.kind === 'text' || input.kind === 'transcript') {
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 1200) throw new TypeError('Enter 1–1,200 characters');
    request = {kind:input.kind,text:input.text.trim()};
  } else if (input.kind === 'photo') {
    if (!(input.photo instanceof Blob) || !photoTypes.has(input.photo.type) || !input.photo.size || input.photo.size > MAX_PHOTO_BYTES) {
      throw new TypeError('Choose a JPEG, PNG or WebP up to 5 MB');
    }
    request = {kind:'photo',photo:input.photo};
  } else {
    throw new TypeError('Unsupported input type');
  }
  const rows = await provider.estimate(request, {signal});
  signal?.throwIfAborted();
  if (rows === null) return {status:'unavailable',source:provider.source};
  if (!['fixture','estimate'].includes(provider.source)) throw new TypeError('Invalid provider source');
  return {status:'review',source:provider.source,rows:validateRows(rows)};
}

export function makeFixtureProvider(getSamplePhoto) {
  return {
    source:'fixture',
    async estimate(input, {signal}) {
      if (input.kind === 'photo') {
        const fixture = await getSamplePhoto();
        signal?.throwIfAborted();
        if (fixture.type !== input.photo.type || fixture.size !== input.photo.size) return null;
        const bytes = new Uint8Array(await input.photo.arrayBuffer());
        const sample = new Uint8Array(await fixture.arrayBuffer());
        if (!bytes.every((byte,i)=>byte===sample[i])) return null;
      } else if (input.text.toLowerCase().replace(/[.!?]+$/,'') !== SAMPLE_TEXT.toLowerCase()) {
        return null;
      }
      return [{description:'Pear • fictional medium serving',kj:410,macros:{protein_g:0.6,carbs_g:20,fat_g:0.2,fibre_g:5},groups:{fruit:410}}];
    }
  };
}
