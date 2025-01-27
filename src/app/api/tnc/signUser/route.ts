import { NextResponse } from 'next/server';

import { LATEST_TNC_DOC_VERSION, SIGNING_DATA } from '@/constants';
import { db } from '@/db';
import { standariseAddress } from '@/utils';
import { Account, CallData, RpcProvider, stark } from 'starknet';
import { toBigInt } from 'ethers';
import Mixpanel from 'mixpanel';
const mixpanel = Mixpanel.init('118f29da6a372f0ccb6f541079cad56b');

export async function POST(req: Request) {
  const { address, signature, _signature } = await req.json();

  console.debug(
    'address',
    address,
    'signature',
    signature,
    '_signature',
    _signature,
  );
  if (!address || !signature) {
    return NextResponse.json({
      success: false,
      message: 'address or signature not found',
      user: null,
    });
  }

  // standardised address
  let parsedAddress = address;
  try {
    parsedAddress = standariseAddress(address);
  } catch (e) {
    throw new Error('Invalid address');
  }

  const parsedSignature = JSON.parse(signature) as string[];
  console.debug(address, parsedSignature, 'parsedSignature');

  if (!parsedSignature || parsedSignature.length <= 0) {
    return NextResponse.json({
      success: false,
      message: 'parsing of signature failed',
      user: null,
    });
  }

  const provider = new RpcProvider({
    nodeUrl: process.env.NEXT_PUBLIC_RPC_URL!,
  });

  const myAccount = new Account(provider, address, '');

  let isValid = false;

  console.debug(`Verifying signature for address: ${parsedAddress}`);
  console.debug(`SIGNING_DATA`, SIGNING_DATA);
  try {
    const hash = await myAccount.hashMessage(SIGNING_DATA);
    isValid = await verifyMessageHash(myAccount, hash, parsedSignature);
    console.debug('isValid', isValid);
    mixpanel.track('TnC signed', { address, signature, _signature, step: 1 });
  } catch (error) {
    console.error('verification failed [1]:', error);
    if (_signature) {
      try {
        const parsedSignature2 = JSON.parse(_signature) as string[];
        const hash = await myAccount.hashMessage(SIGNING_DATA);
        isValid = await verifyMessageHash(myAccount, hash, parsedSignature2);
        console.debug('isValid', isValid);
        mixpanel.track('TnC signed', {
          address,
          signature,
          _signature,
          step: 2,
        });
      } catch (err) {
        console.error('verification failed [2]:', err);

        // temporarily accepting all signtures
        isValid = true;
        mixpanel.track('TnC signing failed', {
          address,
          signature,
          _signature,
        });
      }
    }
  }

  if (!isValid) {
    return NextResponse.json({
      success: false,
      message: 'Invalid signature. Ensure account is deployed.',
      user: null,
    });
  }

  const user = await db.user.findFirst({
    where: {
      address: parsedAddress,
    },
  });

  if (!user) {
    return NextResponse.json({
      success: false,
      message: 'User not found',
      user: null,
    });
  }

  const updatedUser = await db.user.update({
    where: {
      address: parsedAddress,
    },
    data: {
      message: signature,
      isTncSigned: true,
      tncDocVersion: LATEST_TNC_DOC_VERSION,
      Signatures: {
        create: [
          {
            signature,
            tncDocVersion: LATEST_TNC_DOC_VERSION,
          },
        ],
      },
    },
  });

  return NextResponse.json({
    success: true,
    message: 'Tnc signed successfully',
    user: updatedUser,
  });
}

async function verifyMessageHash(
  account: Account,
  hash: string,
  signature: string[],
  entrypoint = 'isValidSignature',
) {
  try {
    const resp = await account.callContract({
      contractAddress: account.address,
      entrypoint,
      calldata: CallData.compile({
        hash: toBigInt(hash).toString(),
        signature: stark.formatSignature(signature),
      }),
    });
    if (Number(resp[0]) == 0) {
      return false;
    }
    return true;
  } catch (err: any) {
    console.error('Error verifying signature:', err);
    if (entrypoint === 'isValidSignature') {
      console.debug(
        'could be Invalid message selector, trying with is_valid_signature',
      );
      return verifyMessageHash(account, hash, signature, 'is_valid_signature');
    }

    if (
      [
        'argent/invalid-signature',
        'is invalid, with respect to the public key',
      ].some((errMessage) => err.message.includes(errMessage))
    ) {
      throw Error('Invalid signature');
    }
    throw Error(
      `Signature verification request is rejected by the network: ${err}`,
    );
  }
}
