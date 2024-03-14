import CONSTANTS, { TokenName } from "@/constants";
import axios from 'axios'
import { Category, PoolInfo, PoolType, ProtocolAtoms, StrkDexIncentivesAtom } from "./pools";
import { Ekubo } from "./ekobu.store";
import { atom } from "jotai";
import { Jediswap } from "./jedi.store";

export class StarkDefi extends Jediswap {
    name = 'StarkDefi'
    link = 'https://app.starkdefi.com/#/pool'
    logo = 'https://app.starkdefi.com/favicon.png'

    incentiveDataKey = 'StarkDefi'
}


export const starkDefi = new StarkDefi();
const StarkDefiAtoms: ProtocolAtoms = {
    pools: atom((get) => {
        const poolsInfo = get(StrkDexIncentivesAtom)
        const empty: PoolInfo[] = [];
        if (poolsInfo.data) return starkDefi._computePoolsInfo(poolsInfo.data);
        else return empty;
    })
}
export default StarkDefiAtoms;