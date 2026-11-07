// Sample Express app for the attack surface tests (F2.6), never run.
import * as security from './lib/insecurity'
import { retrieveBasket } from './routes/basket'
import { orderHistory } from './routes/orderHistory'

app.use('/rest/basket/:id', security.isAuthorized())
app.get('/rest/basket/:id', retrieveBasket())
app.get('/rest/order-history', security.isAuthorized(), orderHistory())
app.get('/rest/products/search', (req, res) => res.json({ q: req.query.q }))
