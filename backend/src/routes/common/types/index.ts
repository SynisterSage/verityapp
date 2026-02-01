import { Response, Request, ParamsDictionary } from 'express';
import { ParsedQs } from 'qs';

/******************************************************************************
                                Types
******************************************************************************/

type TRecord = Record<string, unknown>;
export type IReq = Request<ParamsDictionary, void, TRecord, ParsedQs>;
export type IRes = Response<unknown, TRecord>;

