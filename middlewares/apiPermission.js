module.exports = function requireApiPermission(permission) {
  return (req, res, next) => {
    const permissions = Array.isArray(req.apiKey?.permissions)
      ? req.apiKey.permissions
      : [];

    if (!permissions.includes(permission)) {
      res.locals.apiResponseSummary = {
        success: false,
        statusCode: 403,
        code: "forbidden",
        requiredPermission: permission,
        message: `Permission denied. This API key does not include ${permission}.`,
      };

      return res.status(403).json({
        success: false,
        error: {
          code: "forbidden",
          message: "API key does not have the required permission.",
          requiredPermission: permission,
        },
      });
    }

    next();
  };
};
