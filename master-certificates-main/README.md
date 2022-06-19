# master-certificates
Master certificates for Control Server-Drone communications. WARNING: This repo serves only as an explanation of some aspects of our SSL infrastructure. 

It DOES NOT contain production keys or certificates, however you can use the commands and examples to produce development or testing environments.

## Generating new master CA certificate

/CN = Common Name. Put Organizational Unit Name in charge of SSL infrastructure.
/O = Orgianization. Put name of our organization (company)

```bash
	openssl genrsa -out ca_key.pem 4096
	openssl req -x509 -new -nodes -key ca_key.pem -sha256 -days 1825 -out ca_cert.pem
```

## Generating drone on-board server key & certificate

```bash

# generate server-signed (valid) certifcate
openssl req \
	-newkey rsa:4096 \
	-keyout drone/drone_key.pem \
	-out drone/drone_csr.pem \
	-nodes \
	-days 365 \
	-subj "/CN=Drone\ Unique\ Internal\ ID"

# sign with ca_cert.pem
openssl x509 \
	-req \
	-in drone/drone_csr.pem \
	-CA ca/ca_cert.pem \
	-CAkey ca/ca_key.pem \
	-out drone/drone_cert.pem \
	-set_serial 01 \
	-days 365
```

Resulting drone_cert.pem and drone_key.pem will need to be flashed into the drone, possibly on a secondary volume, separate from Operating System and software (to prevent overwrites in cases of system upgrades). Please note that every drone will need to be reflashed once a year with the new cert and key

## Generating control server key & certificate

```bash

# generate server-signed (valid) certifcate
openssl req \
	-newkey rsa:4096 \
	-keyout server/server_key.pem \
	-out server/server_csr.pem \
	-nodes \
	-days 365 \
	-subj "/CN=Server\ ID"

# sign with ca_cert.pem
openssl x509 \
	-req \
	-in server/server_csr.pem \
	-CA ca/ca_cert.pem \
	-CAkey ca/ca_key.pem \
	-out server/server_cert.pem \
	-set_serial 01 \
	-days 365
```

## Create self-signed certificate that will fail validattion against CA

```bash
# generate self-signed (invalid) certifcate
openssl req \
	-newkey rsa:4096 \
	-keyout invalid/bob_key.pem \
	-out invalid/bob_csr.pem \
	-nodes \
	-days 365 \
	-subj "/CN=Bob"

# sign with bob_csr.pem
openssl x509 \
	-req \
	-in invalid/bob_csr.pem \
	-signkey invalid/bob_key.pem \
	-out invalid/bob_cert.pem \
	-days 365
```


## Example node.js implementations

Firstly, run in terminal: `npm i`

Check `drone-server-validation-test.js` and `server-drone-validation-test.js`. To run either, use `npm run drone-server` or `npm run server-drone`.

To test auth with valid client cert, use `npm run valid-client`. You should get something like this as response: `Hello Server ID, your certificate was issued by Drone AI Certificate Authority!`.
To test auth with valid client cert, use `npm run invalid-client`. You should get something like this as response: `Sorry Bob, certificates from Bob are not welcome here.`