/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

exports.intiateAudit = async (user, AuditId, Initiator, AuditType, Reason, Tenure, AuditDate, Status) => {
	try {

		const { Gateway, Wallets } = require('fabric-network');
		const path = require('path');
		const { buildCCPOrg1, buildWallet } = require('../test-application/javascript/AppUtil.js');

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

		const auditData = {
			auditId: AuditId,
			initiator: Initiator,
			auditType: AuditType,
			reason: Reason,
			tenure: Tenure,
			auditDate: AuditDate,
			status: Status
		  };
		  
		const auditDataString = JSON.stringify(auditData);
		let statefulTxn = contract.createTransaction('InitiateAudit');
		console.log('\n--> Submit Transaction: Initiate the audit');
		const transaction_id  = await statefulTxn.submit(auditDataString);
		gateway.disconnect();
		return(transaction_id.toString())
		
	} catch (error) {
		console.error(`******** FAILED to submit bid: ${error}`);
		process.exit(1);
	}
}

