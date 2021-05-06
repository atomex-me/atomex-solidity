include .env
export $(shell sed 's/=.*//' .env)

.ONESHELL:
.PHONY: test

test:
	npm run truffle

deploy-ropsten:
	npm run deploy_ropsten 2>&1| tee deploy.output

deploy-mainnet:
	npm run deploy_mainnet 2>&1| tee deploy.output

verify-mainnet:
	npm run verify_mainnet

verify-ropsten:
	./node_modules/.bin/truffle run verify Atomex@$$ATOMEX_ADDRESS --network ropsten

github-deployment:
	CONTRACT_ADDRESS=$$(cat deploy.output | grep "contract address" | awk '{ print $$4 }' | tail -1)
	ETHERSCAN_URL=https://etherscan.io/address/$$CONTRACT_ADDRESS
	echo "Check out deployed contract at $$ETHERSCAN_URL"
	curl -0 -X POST https://api.github.com/repos/$$TRAVIS_REPO_SLUG/deployments \
		-H "Accept: application/vnd.github.ant-man-preview+json" \
		-H "Authorization: token $$GH_TOKEN" \
		-d "{ \"ref\": \"master\", \"environment\": \"mainnet\", \"required_contexts\": [] }" \
		2>&1| tee deployment.output
	STATUSES_URL="$$(cat deployment.output | grep statuses_url | awk -F\" '{ print $$4 }')"
	curl -0 -X POST $$STATUSES_URL \
		-H "Accept: application/vnd.github.ant-man-preview+json" \
		-H "Authorization: token $$GH_TOKEN" \
		-d "{ \"state\": \"success\", \"environment\": \"mainnet\", \"environment_url\": \"$$ETHERSCAN_URL\" }"

ropsten:
	$(MAKE) deploy-ropsten
	$(MAKE) github-deployment
	npm run verify_ropsten