/**
 * Validates req.body / req.query / req.params against zod schemas.
 * Parsed (coerced + stripped) values replace the originals on req.valid.
 *
 *   router.post('/', validate({ body: createJobSchema }), createJob)
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = {};
  for (const key of ['params', 'query', 'body']) {
    if (schemas[key]) {
      req.valid[key] = schemas[key].parse(req[key] ?? {});
    }
  }
  next();
};
