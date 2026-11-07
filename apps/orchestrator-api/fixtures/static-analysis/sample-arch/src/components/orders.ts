// Sample code for the static analysis fixtures (F2.5): a component reading the database.
import { db } from '../lib/db';

export const rows = db.query();
