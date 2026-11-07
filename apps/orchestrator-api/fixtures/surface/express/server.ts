// Sample Express app for the attack surface tests (F2.6), never run.
import * as security from './lib/insecurity'
import { retrieveBasket } from './routes/basket'
import { orderHistory } from './routes/orderHistory'
import { late } from './routes/late'

app.use('/rest/basket/:id', security.isAuthorized())
app.get('/rest/basket/:id', retrieveBasket())
app.get('/rest/order-history', orderHistory())
app.get('/rest/products/search', (req, res) => res.json({ q: req.query.q }))
app.post('/api/Products', security.isAuthorized())
app.get('/rest/late', late())
app.use('/rest/late', security.isAuthorized())
