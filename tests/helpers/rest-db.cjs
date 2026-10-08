class SupabaseRequestError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}
const identifier = value => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw new Error('Invalid SQL identifier in test adapter');
  return '"' + value + '"';
};
function createRestDb(db) {
  const supabaseRest = async (resource, options = {}) => {
    const url = new URL(resource, 'http://fixture.invalid/');
    const body = options.body ? JSON.parse(options.body) : null;
    try {
      if (url.pathname.startsWith('/rpc/')) {
        const name = identifier(url.pathname.slice(5));
        const args = Object.entries(body || {});
        return (await db.query('select public.' + name + '(' + args.map(([key], i) => identifier(key) + ' => $' + (i + 1)).join(',') + ') as result', args.map(([, value]) => value))).rows[0].result;
      }
      const table = identifier(url.pathname.slice(1));
      const values = [];
      const where = [];
      for (const [column, filter] of url.searchParams) {
        if (['select', 'order', 'limit', 'on_conflict'].includes(column)) continue;
        if (!filter.startsWith('eq.')) throw new Error('Unsupported test filter');
        values.push(filter.slice(3)); where.push(identifier(column) + ' = $' + values.length);
      }
      const predicate = where.length ? ' where ' + where.join(' and ') : '';
      if ((options.method || 'GET') === 'GET') {
        const columns = url.searchParams.get('select') || '*';
        const selection = columns === '*' ? '*' : columns.split(',').map(identifier).join(',');
        const order = (url.searchParams.get('order') || '').split(',').filter(Boolean).map(order => {
          const [column, direction] = order.split('.'); return identifier(column) + (direction === 'desc' ? ' desc' : ' asc');
        }).join(',');
        const limit = Number(url.searchParams.get('limit') || 100000);
        return (await db.query('select ' + selection + ' from public.' + table + predicate + (order ? ' order by ' + order : '') + ' limit ' + Math.min(limit, 100000), values)).rows;
      }
      if (options.method === 'PATCH') {
        const entries = Object.entries(body);
        return (await db.query('update public.' + table + ' set ' + entries.map(([key], index) => identifier(key) + ' = $' + (values.length + index + 1)).join(',') + predicate + ' returning *', [...values, ...entries.map(([, value]) => value)])).rows;
      }
      if (options.method === 'POST') {
        const entries = Object.entries(body);
        const conflict = url.searchParams.get('on_conflict');
        const sql = 'insert into public.' + table + '(' + entries.map(([key]) => identifier(key)).join(',') + ') values(' + entries.map((_, index) => '$' + (index + 1)).join(',') + ')' +
          (conflict ? ' on conflict (' + identifier(conflict) + ') do update set ' + entries.filter(([key]) => key !== conflict).map(([key]) => identifier(key) + '=excluded.' + identifier(key)).join(',') : '') + ' returning *';
        return (await db.query(sql, entries.map(([, value]) => value))).rows;
      }
      throw new Error('Unsupported test operation');
    } catch (error) { throw new SupabaseRequestError(error.message, error.code === '23505' ? 409 : 503, error.code); }
  };
  return { supabaseRest, supabaseQuery: values => new URLSearchParams(values).toString(), SupabaseRequestError };
}
module.exports = { createRestDb };
