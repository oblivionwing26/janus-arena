// Incorrect: any signed-in user can read any basket by its id.
export function retrieveBasket () {
  return async (req, res) => {
    const basket = await BasketModel.findOne({ where: { id: req.params.id } })
    res.json(basket)
  }
}
