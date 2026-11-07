// Correct (F2.6 tests): reads the session itself, refuses without one, and filters the orders
// by a value computed from the session user's email.
export function orderHistory () {
  return async (req, res, next) => {
    const loggedInUser = security.authenticatedUsers.get(req.headers?.authorization?.replace('Bearer ', ''))
    if (loggedInUser?.data?.email) {
      const email = loggedInUser.data.email
      const masked = email.replace(/[aeiou]/gi, '*')
      const orders = await ordersCollection.find({ email: masked })
      res.json(orders)
    } else {
      next(new Error('Blocked illegal activity'))
    }
  }
}
