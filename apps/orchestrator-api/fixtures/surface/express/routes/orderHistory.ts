// Correct: only the orders of the session's user.
export function orderHistory () {
  return async (req, res) => {
    const loggedInUser = security.authenticatedUsers.get(req.headers?.authorization?.replace('Bearer ', ''))
    const orders = await ordersCollection.find({ email: loggedInUser.data.email })
    res.json(orders)
  }
}
