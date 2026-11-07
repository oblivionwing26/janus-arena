// Incorrect on purpose (F2.6 tests): any signed-in user can read any basket by its id. The
// session user is read only to mark a challenge as solved, which controls nothing.
export function retrieveBasket () {
  return async (req, res) => {
    const id = req.params.id
    const basket = await BasketModel.findOne({ where: { id } })
    challengeUtils.solveIf(challenges.basketAccessChallenge, () => {
      const user = security.authenticatedUsers.from(req)
      return user && user.bid != parseInt(id, 10)
    })
    res.json(basket)
  }
}
