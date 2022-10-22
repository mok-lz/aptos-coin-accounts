import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
dotenv.config();

import bodyParser from "body-parser";
import cors from "cors";

import rawTxRouter from "./router/raw-transaction";
import multisigRouter from "./router/multisig";

import { sucResponse } from "./types";
import { PORT } from "./config";

const app: Express = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

app.get("/", (req: Request, res: Response) => {
  sucResponse(res, "work");
});

app.use("/raw-tx", rawTxRouter);
app.use("/multisig", multisigRouter);

app.listen(PORT, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
});
