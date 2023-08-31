/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

const { Gateway, Wallets } = require('fabric-network');
const { buildCCPOrg1, buildWallet } = require('../test-application/javascript/AppUtil.js');
const path = require('path');
'use strict';

exports.fetchAllAudit = async (user) => {
	try {


		const myChannel = 'test';
		const myChaincodeName = 'audit';
		const gateway = new Gateway();

		const ccp = buildCCPOrg1();
		const walletPath = path.join(__dirname, 'wallet/org1');
		const wallet = await buildWallet(Wallets, walletPath);

		// Connect using Discovery enabled
		await gateway.connect(ccp,
			{ wallet: wallet, identity: user, discovery: { enabled: true, asLocalhost: true } });

		const network = await gateway.getNetwork(myChannel);
		const contract = network.getContract(myChaincodeName);

		let result = await contract.evaluateTransaction('FetchAllAudits');
		console.log('\n--> Evaluate Transaction: Fetch All audits');
		gateway.disconnect();
		return(result.toString());
		
	} catch (error) {
		console.error(`******** FAILED to query blockchain: ${error}`);
	}
}

