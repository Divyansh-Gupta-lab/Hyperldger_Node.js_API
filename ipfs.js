var ipfsAPI = require('ipfs-api');

// Connect to the local IPFS node
var ipfs = ipfsAPI('localhost', '5001', { protocol: 'http' });

// Function to add data to IPFS and return the hash
exports.upload = async function addToIPFS(data) {
  return new Promise((resolve, reject) => {
    ipfs.add(Buffer.from(data), (err, result) => {
      if (err) {
        reject(err);
        return;
      }

      // Resolve with the CID (Content Identifier) of the added data
      resolve(result[0].hash);
    });
  });
}

// Function to fetch data from IPFS using a given CID
exports.fetch = async function getDataFromIPFS(cid) {
  return new Promise((resolve, reject) => {
    ipfs.get(cid, (err, files) => {
      if (err) {
        reject(err);
        return;
      }

      // Assuming the data is stored in a single file
      var fetchedData = files[0].content;

      resolve(fetchedData);
    });
  });
}
