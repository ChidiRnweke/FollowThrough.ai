# Changelog

## [2.0.8](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v2.0.7...v2.0.8) (2026-10-03)


### Continuous Integration

* **testing:** use pinned Playwright image for browser checks ([#296](https://github.com/ChidiRnweke/FollowThrough.ai/issues/296)) ([b29d597](https://github.com/ChidiRnweke/FollowThrough.ai/commit/b29d5975b33e529d8f8294acdbb2460409903f02))

## [2.0.7](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v2.0.6...v2.0.7) (2026-10-01)


### Performance Improvements

* **testing:** speed up contract and browser test runs ([#294](https://github.com/ChidiRnweke/FollowThrough.ai/issues/294)) ([46c2ae4](https://github.com/ChidiRnweke/FollowThrough.ai/commit/46c2ae45528edd71fe0be7afb2441616e77a73d3))

## [2.0.6](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v2.0.5...v2.0.6) (2026-09-30)


### Bug Fixes

* **sync:** rebase local writes instead of reporting false conflicts ([#291](https://github.com/ChidiRnweke/FollowThrough.ai/issues/291)) ([2e18a19](https://github.com/ChidiRnweke/FollowThrough.ai/commit/2e18a19b515990c0ea4bb6dc514fe2311f662546))

## [2.0.5](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v2.0.4...v2.0.5) (2026-09-30)


### Bug Fixes

* **notes:** make table row and column menus act on the selected row ([#290](https://github.com/ChidiRnweke/FollowThrough.ai/issues/290)) ([91d86ef](https://github.com/ChidiRnweke/FollowThrough.ai/commit/91d86ef90e1d57819369630553ec8a0a5d1487e9))

## [2.0.4](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v2.0.3...v2.0.4) (2026-09-30)


### Bug Fixes

* **projects:** drop notes onto folders and into empty folders ([#284](https://github.com/ChidiRnweke/FollowThrough.ai/issues/284)) ([7cb5d53](https://github.com/ChidiRnweke/FollowThrough.ai/commit/7cb5d5396c0515bc9185c3993576f4b474c36761))

## [2.0.3](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v2.0.2...v2.0.3) (2026-09-30)


### Styles

* **ui:** remove left-edge highlight bars ([#287](https://github.com/ChidiRnweke/FollowThrough.ai/issues/287)) ([0ad9449](https://github.com/ChidiRnweke/FollowThrough.ai/commit/0ad9449463fbc4f288399dae9d5073aaff040c09))

## [2.0.2](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v2.0.1...v2.0.2) (2026-09-30)


### Bug Fixes

* **projects:** keep collapsed tree folders closed across sidebar reopen ([#285](https://github.com/ChidiRnweke/FollowThrough.ai/issues/285)) ([400c172](https://github.com/ChidiRnweke/FollowThrough.ai/commit/400c172578fb0192c60c05b28eb92bb4fcfa1e85))

## [2.0.1](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v2.0.0...v2.0.1) (2026-09-28)


### Bug Fixes

* **chat:** keep the compact diff label clear while its pane scrolls ([#282](https://github.com/ChidiRnweke/FollowThrough.ai/issues/282)) ([bdbe0ed](https://github.com/ChidiRnweke/FollowThrough.ai/commit/bdbe0ed19a33b55e69878f7a78c4c773ca73b61a))

## [2.0.0](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v1.1.0...v2.0.0) (2026-09-28)


### ⚠ BREAKING CHANGES

* **agent:** application tool failures use kind, code, message, recovery, and details. Prior envelopes have no compatibility reader or migration.

### Bug Fixes

* **agent:** recover tool failures before approval ([#280](https://github.com/ChidiRnweke/FollowThrough.ai/issues/280)) ([7c22488](https://github.com/ChidiRnweke/FollowThrough.ai/commit/7c22488a83cff206ca68e26d2a0b52abe4607471))
* **workbench:** blend tab-strip edge controls into the strip ([#279](https://github.com/ChidiRnweke/FollowThrough.ai/issues/279)) ([4b81c34](https://github.com/ChidiRnweke/FollowThrough.ai/commit/4b81c34a1bb548a5630a49bc5c37a6f53b2301e9))

## [1.1.0](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v1.0.1...v1.1.0) (2026-09-28)


### Features

* **shell:** move app navigation to an icon rail beside an inset project panel ([#276](https://github.com/ChidiRnweke/FollowThrough.ai/issues/276)) ([85be6ce](https://github.com/ChidiRnweke/FollowThrough.ai/commit/85be6ce978f8713c765ec0423f3cb095a4c51732))

## [1.0.1](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v1.0.0...v1.0.1) (2026-09-28)


### Bug Fixes

* **workspace:** show the sidebar during initial sync ([#275](https://github.com/ChidiRnweke/FollowThrough.ai/issues/275)) ([9869295](https://github.com/ChidiRnweke/FollowThrough.ai/commit/9869295c76d9d9a649f9a868c26dad2daac28814))

## [1.0.0](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.5.12...v1.0.0) (2026-09-27)


### ⚠ BREAKING CHANGES

* **domains:** create_todos requires a UUID requestId. Reuse it with identical input when retrying an uncertain outcome.

### Bug Fixes

* **agent:** preserve cancellation ownership on approval resume ([#265](https://github.com/ChidiRnweke/FollowThrough.ai/issues/265)) ([bf48e3e](https://github.com/ChidiRnweke/FollowThrough.ai/commit/bf48e3ef7cf5b926605d27e955ade7a366529052))
* **agent:** retain discovery guidance for truncated skill catalogs ([#248](https://github.com/ChidiRnweke/FollowThrough.ai/issues/248)) ([35909b9](https://github.com/ChidiRnweke/FollowThrough.ai/commit/35909b9440e31ea6229cadaede7d308c7d5759fd))
* **attachments:** advance cleanup past failed reservations ([#270](https://github.com/ChidiRnweke/FollowThrough.ai/issues/270)) ([b60fc64](https://github.com/ChidiRnweke/FollowThrough.ai/commit/b60fc64d91faf82b4d12fabaa4b4130d3a47b5a9))
* **attachments:** hide archived project files ([#272](https://github.com/ChidiRnweke/FollowThrough.ai/issues/272)) ([e0c7118](https://github.com/ChidiRnweke/FollowThrough.ai/commit/e0c7118d598c8c4bdb60c7edcfc0629c25fa1a1d))
* **attachments:** preserve note versions during path removal ([#268](https://github.com/ChidiRnweke/FollowThrough.ai/issues/268)) ([eeba1da](https://github.com/ChidiRnweke/FollowThrough.ai/commit/eeba1da93f1c338baa96f625db30cd7baf5139af))
* **auth:** refuse missing authenticated request actors ([#250](https://github.com/ChidiRnweke/FollowThrough.ai/issues/250)) ([1f47c13](https://github.com/ChidiRnweke/FollowThrough.ai/commit/1f47c134fd6cdcd8e85a67d163d507ee57872f13))
* **auth:** renew browser cookies with stored session expiry ([#232](https://github.com/ChidiRnweke/FollowThrough.ai/issues/232)) ([c875bcf](https://github.com/ChidiRnweke/FollowThrough.ai/commit/c875bcf17a40efa5dbc317a6207c057c40153431))
* **diagrams:** guard cached opens after project archive ([#252](https://github.com/ChidiRnweke/FollowThrough.ai/issues/252)) ([81e5a25](https://github.com/ChidiRnweke/FollowThrough.ai/commit/81e5a25abfcbbb5b322f95a24ea7b451e9c9dba6))
* **domains:** land assessed workflow and data integrity fixes ([#220](https://github.com/ChidiRnweke/FollowThrough.ai/issues/220)) ([418c201](https://github.com/ChidiRnweke/FollowThrough.ai/commit/418c201a003fd61b4aac19fa38d76876804bc286))
* **evals:** initialize fixture accounts explicitly ([#257](https://github.com/ChidiRnweke/FollowThrough.ai/issues/257)) ([a8e0f91](https://github.com/ChidiRnweke/FollowThrough.ai/commit/a8e0f91f9a52b95a6f3931cbfcffd0321a08b104))
* **feedback:** show and enforce the report length limit ([#266](https://github.com/ChidiRnweke/FollowThrough.ai/issues/266)) ([9cb94e0](https://github.com/ChidiRnweke/FollowThrough.ai/commit/9cb94e0bfa6e97c16007e0a4986d750ac0f7cf90))
* **identity:** provision local accounts before workspace writes ([#255](https://github.com/ChidiRnweke/FollowThrough.ai/issues/255)) ([374afe9](https://github.com/ChidiRnweke/FollowThrough.ai/commit/374afe96f5d8ef2c9a5d940e5f281acd2f0a3b8b))
* **memory:** guard retained entries after project archival ([#221](https://github.com/ChidiRnweke/FollowThrough.ai/issues/221)) ([071dbcb](https://github.com/ChidiRnweke/FollowThrough.ai/commit/071dbcb6f2f1d39a280f81c763235d55e0b0dfd3))
* **memory:** hide archived project memory in open panels ([#222](https://github.com/ChidiRnweke/FollowThrough.ai/issues/222)) ([370d4f8](https://github.com/ChidiRnweke/FollowThrough.ai/commit/370d4f8ef97e01cb06cde2df53cfed94925b2efa))
* **memory:** preserve caller provenance in proposals ([#228](https://github.com/ChidiRnweke/FollowThrough.ai/issues/228)) ([b6327da](https://github.com/ChidiRnweke/FollowThrough.ai/commit/b6327daa08d7efb2c01fcdfd603f51eb0b37d24a))
* **memory:** retain classification on proposed updates ([#229](https://github.com/ChidiRnweke/FollowThrough.ai/issues/229)) ([0ac5f6e](https://github.com/ChidiRnweke/FollowThrough.ai/commit/0ac5f6effaa19420f2be23cb95a069a42e1a93fa))
* **memory:** serialize deletion with concurrent edits ([#224](https://github.com/ChidiRnweke/FollowThrough.ai/issues/224)) ([7f726da](https://github.com/ChidiRnweke/FollowThrough.ai/commit/7f726da35435811846d27d9a50f08b75cf209a9b))
* **notes:** count header-like body lines in revision diffs ([#259](https://github.com/ChidiRnweke/FollowThrough.ai/issues/259)) ([472215f](https://github.com/ChidiRnweke/FollowThrough.ai/commit/472215f51169fd0273e3ee934eb6038ba1f6dfe3))
* **notes:** discard against the latest locked publication ([#253](https://github.com/ChidiRnweke/FollowThrough.ai/issues/253)) ([2b7d808](https://github.com/ChidiRnweke/FollowThrough.ai/commit/2b7d808873973cc980521b19363eb8444ce8721e))
* **notes:** guard cached opens after project archive ([#249](https://github.com/ChidiRnweke/FollowThrough.ai/issues/249)) ([a25f3f5](https://github.com/ChidiRnweke/FollowThrough.ai/commit/a25f3f503260647234d17268fc8537c7f072ae74))
* **notes:** report unreadable import outcomes accurately ([#263](https://github.com/ChidiRnweke/FollowThrough.ai/issues/263)) ([2073653](https://github.com/ChidiRnweke/FollowThrough.ai/commit/20736539029ad90200866c2192b99be66999c6b6))
* **notes:** retain the latest history selection and restore outcome ([#256](https://github.com/ChidiRnweke/FollowThrough.ai/issues/256)) ([68339e5](https://github.com/ChidiRnweke/FollowThrough.ai/commit/68339e57ba9fc0ca70df1fa1d60aab0ab52e0d4b))
* **notes:** show truthful version history feedback ([#254](https://github.com/ChidiRnweke/FollowThrough.ai/issues/254)) ([b1a35b5](https://github.com/ChidiRnweke/FollowThrough.ai/commit/b1a35b57dc97c0750524d955261bd4063ad20d11))
* **observability:** retain oversized browser error reports ([#267](https://github.com/ChidiRnweke/FollowThrough.ai/issues/267)) ([0debba8](https://github.com/ChidiRnweke/FollowThrough.ai/commit/0debba83997e7d64edc2d8c3718898bcd4249367))
* **projects:** count visible siblings when moving tree entries ([#261](https://github.com/ChidiRnweke/FollowThrough.ai/issues/261)) ([a2619ba](https://github.com/ChidiRnweke/FollowThrough.ai/commit/a2619ba6c713e22e1ff65707256766839006c6bb))
* **projects:** keep deeply nested notes reachable in the tree ([#260](https://github.com/ChidiRnweke/FollowThrough.ai/issues/260)) ([68f3145](https://github.com/ChidiRnweke/FollowThrough.ai/commit/68f3145d71b72d80a56a1778778f8838869c1b4b))
* **projects:** retain descriptions during name-only renames ([#234](https://github.com/ChidiRnweke/FollowThrough.ai/issues/234)) ([c148f46](https://github.com/ChidiRnweke/FollowThrough.ai/commit/c148f467f32a71ba5bd217a76f232c674d59c876))
* **runtime:** drain web and worker before stopping telemetry ([#264](https://github.com/ChidiRnweke/FollowThrough.ai/issues/264)) ([62fc7c8](https://github.com/ChidiRnweke/FollowThrough.ai/commit/62fc7c8145598bc8f9f0131c9fd5b4b0fd6aa445))
* **search:** exclude archived projects from knowledge retrieval ([#225](https://github.com/ChidiRnweke/FollowThrough.ai/issues/225)) ([4f7c671](https://github.com/ChidiRnweke/FollowThrough.ai/commit/4f7c6717ab9308873d075e33ab4c4c8bd6fde31e))
* **settings:** retain minted tokens when the list fails ([#237](https://github.com/ChidiRnweke/FollowThrough.ai/issues/237)) ([1dca4a0](https://github.com/ChidiRnweke/FollowThrough.ai/commit/1dca4a09d3926d895366638b1d1c98d9c021a659))
* **skills:** create initial instructions atomically ([#241](https://github.com/ChidiRnweke/FollowThrough.ai/issues/241)) ([84f79b0](https://github.com/ChidiRnweke/FollowThrough.ai/commit/84f79b0ba473dc2f0e4fc3a70093a10f1c9eab67))
* **skills:** enforce the description limit on metadata edits ([#246](https://github.com/ChidiRnweke/FollowThrough.ai/issues/246)) ([3de29dc](https://github.com/ChidiRnweke/FollowThrough.ai/commit/3de29dc0535f424d13dcc55b6e59f08009c6e835))
* **skills:** hide archived content from cached details ([#243](https://github.com/ChidiRnweke/FollowThrough.ai/issues/243)) ([928c1cf](https://github.com/ChidiRnweke/FollowThrough.ai/commit/928c1cf159c4610c5619ec7c422a9afc0a84a4e4))
* **skills:** list newest history snapshots first ([#245](https://github.com/ChidiRnweke/FollowThrough.ai/issues/245)) ([c57ee7d](https://github.com/ChidiRnweke/FollowThrough.ai/commit/c57ee7d27cf5bec9e94c50ad1744092020be01e4))
* **suggestions:** hide archived project proposals without notes ([#227](https://github.com/ChidiRnweke/FollowThrough.ai/issues/227)) ([1814b42](https://github.com/ChidiRnweke/FollowThrough.ai/commit/1814b420277825d9ff970c9a6cff91ba3ef0ee1a))
* **telemetry:** preserve aborted transaction failures ([#271](https://github.com/ChidiRnweke/FollowThrough.ai/issues/271)) ([8979bc3](https://github.com/ChidiRnweke/FollowThrough.ai/commit/8979bc36809d956e25ba37e91979520e5bd069d7))
* **trash:** distinguish incomplete inventories before bulk deletion ([#262](https://github.com/ChidiRnweke/FollowThrough.ai/issues/262)) ([cc99fdd](https://github.com/ChidiRnweke/FollowThrough.ai/commit/cc99fdda9bd1812729e46d1c3da486469e4e2316))
* **workspace:** hide archived project collections ([#251](https://github.com/ChidiRnweke/FollowThrough.ai/issues/251)) ([04ed5e5](https://github.com/ChidiRnweke/FollowThrough.ai/commit/04ed5e52265d440cf9b28701a8c4539a96f0dda8))
* **workspace:** hide archived project context in retained records ([#258](https://github.com/ChidiRnweke/FollowThrough.ai/issues/258)) ([034dbbd](https://github.com/ChidiRnweke/FollowThrough.ai/commit/034dbbdf31aebd9ad3b9e7bf9e85d876e25db063))


### Code Refactoring

* **architecture:** permit explicit shared service layers ([#71](https://github.com/ChidiRnweke/FollowThrough.ai/issues/71)) ([2d79ee6](https://github.com/ChidiRnweke/FollowThrough.ai/commit/2d79ee63fd0f1933d78ffdb7ee68fa13509da55a))
* **projects:** retain explicit project selection paths ([#235](https://github.com/ChidiRnweke/FollowThrough.ai/issues/235)) ([c0c5325](https://github.com/ChidiRnweke/FollowThrough.ai/commit/c0c53259a1b82987901ba06445c09ef509f62ec4))
* **skills:** remove unused save and export paths ([#244](https://github.com/ChidiRnweke/FollowThrough.ai/issues/244)) ([8d4723d](https://github.com/ChidiRnweke/FollowThrough.ai/commit/8d4723d8cc181b91bdcd1a6017821494065f2aff))
* **suggestions:** retain typed dismissal outcomes ([#223](https://github.com/ChidiRnweke/FollowThrough.ai/issues/223)) ([0a41655](https://github.com/ChidiRnweke/FollowThrough.ai/commit/0a41655fe2faec82667fa1ccf4dc61f0176de6d5))

## [0.5.12](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.5.11...v0.5.12) (2026-09-18)


### Bug Fixes

* **agent:** give a failed tool call advice the model can act on ([#155](https://github.com/ChidiRnweke/FollowThrough.ai/issues/155)) ([ba507c5](https://github.com/ChidiRnweke/FollowThrough.ai/commit/ba507c5da2c5ff59724e9192e326384ae1dd829c))

## [0.5.11](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.5.10...v0.5.11) (2026-09-17)


### Continuous Integration

* gate setup-node cache behind the release-only filter ([#153](https://github.com/ChidiRnweke/FollowThrough.ai/issues/153)) ([4289d54](https://github.com/ChidiRnweke/FollowThrough.ai/commit/4289d541fbbbfe0d1ced93425962cb444dc4b959))
* skip heavy checks on release-only PRs and drop sync-pwa from PRs ([#149](https://github.com/ChidiRnweke/FollowThrough.ai/issues/149)) ([3ee1585](https://github.com/ChidiRnweke/FollowThrough.ai/commit/3ee158563148be6f3bbfd6b1aab0e0520950a839))

## [0.5.10](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.5.9...v0.5.10) (2026-09-15)


### Code Refactoring

* **notes:** bind approval to reviewed content ([#66](https://github.com/ChidiRnweke/FollowThrough.ai/issues/66)) ([9e8f153](https://github.com/ChidiRnweke/FollowThrough.ai/commit/9e8f15305a1a0ffc8bc71a0a36ad6938642d5142))

## [0.5.9](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.5.8...v0.5.9) (2026-09-15)


### Code Refactoring

* **exports:** prepare document content and assets once ([#65](https://github.com/ChidiRnweke/FollowThrough.ai/issues/65)) ([848483a](https://github.com/ChidiRnweke/FollowThrough.ai/commit/848483af60ebb8d766bc09913fa824269cf22d6c))
* **notes:** share note views between browser and server ([#67](https://github.com/ChidiRnweke/FollowThrough.ai/issues/67)) ([1cb8f21](https://github.com/ChidiRnweke/FollowThrough.ai/commit/1cb8f21388b457b208d7b35ecf8556d3263e8f47))
* **search:** reuse indexing and resume queued attachment processing ([#64](https://github.com/ChidiRnweke/FollowThrough.ai/issues/64)) ([f9efaad](https://github.com/ChidiRnweke/FollowThrough.ai/commit/f9efaad7a57b3cd82ae660e374abbc844afbfba2))

## [0.5.8](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.5.7...v0.5.8) (2026-09-15)


### Bug Fixes

* **agent:** commit run results only when completion wins ([#60](https://github.com/ChidiRnweke/FollowThrough.ai/issues/60)) ([8bf0d62](https://github.com/ChidiRnweke/FollowThrough.ai/commit/8bf0d622eabdbaa5e4f15eadd77ac3787ef355bf))
* **workspace:** show an opened note legibly on its first frame ([#62](https://github.com/ChidiRnweke/FollowThrough.ai/issues/62)) ([b9055b7](https://github.com/ChidiRnweke/FollowThrough.ai/commit/b9055b725918e1e8315f8d53de9ddb8bce076ef6))

## [0.5.7](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.5.6...v0.5.7) (2026-09-15)


### Code Refactoring

* **suggestions:** remove the added undo interface ([#59](https://github.com/ChidiRnweke/FollowThrough.ai/issues/59)) ([5cba0bf](https://github.com/ChidiRnweke/FollowThrough.ai/commit/5cba0bf7ac2e61a1153b3cd7a2df02ea0994880d))

## [0.5.6](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.5.5...v0.5.6) (2026-09-15)


### Bug Fixes

* **suggestions:** prevent undo from deleting existing data ([#54](https://github.com/ChidiRnweke/FollowThrough.ai/issues/54)) ([b33df72](https://github.com/ChidiRnweke/FollowThrough.ai/commit/b33df723601e45efea43ddbe9f481d28a3a393b2))
* **workspace:** fade a pane in and hide the pane it replaces ([#56](https://github.com/ChidiRnweke/FollowThrough.ai/issues/56)) ([b4a2378](https://github.com/ChidiRnweke/FollowThrough.ai/commit/b4a23784b69fb0227e51168664a4d5ca2206f980))

## [0.5.5](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.5.4...v0.5.5) (2026-09-15)


### Code Refactoring

* remove obsolete compatibility paths ([#53](https://github.com/ChidiRnweke/FollowThrough.ai/issues/53)) ([f7f7cba](https://github.com/ChidiRnweke/FollowThrough.ai/commit/f7f7cbafed98b3f0cdde4feb54fae88815c3ddc2))

## [0.5.4](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.5.3...v0.5.4) (2026-09-15)


### Bug Fixes

* **skills:** save imports through the note editor as drafts ([#48](https://github.com/ChidiRnweke/FollowThrough.ai/issues/48)) ([830ca5b](https://github.com/ChidiRnweke/FollowThrough.ai/commit/830ca5b0953d6ff251663c7dfefab706b3bdd8aa))


### Code Refactoring

* **proposals:** resolve selection origins once ([#50](https://github.com/ChidiRnweke/FollowThrough.ai/issues/50)) ([48f7f45](https://github.com/ChidiRnweke/FollowThrough.ai/commit/48f7f457d10f0d7662ff91bd42868b03b19acade))
* **workspace:** share offline and server decisions ([#47](https://github.com/ChidiRnweke/FollowThrough.ai/issues/47)) ([1ce7afb](https://github.com/ChidiRnweke/FollowThrough.ai/commit/1ce7afb0ac0a0e3ce86c98e9054eaa9fbba266d6))

## [0.5.3](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.5.2...v0.5.3) (2026-09-15)


### Code Refactoring

* **sync:** own resource open state in the workspace and drop per-pane loaders ([#46](https://github.com/ChidiRnweke/FollowThrough.ai/issues/46)) ([ad17b2b](https://github.com/ChidiRnweke/FollowThrough.ai/commit/ad17b2bdd95de96973b2b8d74f6b28b9fc5d1e93))

## [0.5.2](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.5.1...v0.5.2) (2026-09-15)


### Code Refactoring

* **domains:** compose aggregates from owning record types ([#44](https://github.com/ChidiRnweke/FollowThrough.ai/issues/44)) ([0d890a5](https://github.com/ChidiRnweke/FollowThrough.ai/commit/0d890a5822e9e16abc4d42176f5b3a9404d1b9e7))

## [0.5.1](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.5.0...v0.5.1) (2026-09-15)


### Bug Fixes

* **build:** keep code-split stylesheets beside their bundled fonts ([#42](https://github.com/ChidiRnweke/FollowThrough.ai/issues/42)) ([5173616](https://github.com/ChidiRnweke/FollowThrough.ai/commit/51736167cc19ab848f62d314d63d2aa15fd9ac4d))

## [0.5.0](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.4.2...v0.5.0) (2026-09-15)


### Features

* **sync:** replace route caches with shared offline resources ([#37](https://github.com/ChidiRnweke/FollowThrough.ai/issues/37)) ([bf87a83](https://github.com/ChidiRnweke/FollowThrough.ai/commit/bf87a8318ed6f7f109b225c7c50734e20c3911c9))

## [0.4.2](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.4.1...v0.4.2) (2026-09-07)


### Bug Fixes

* **chat:** state a turn's failure on the subject it befell, and put "nothing" behind its own row ([#35](https://github.com/ChidiRnweke/FollowThrough.ai/issues/35)) ([e44c031](https://github.com/ChidiRnweke/FollowThrough.ai/commit/e44c031a80a53987fe7cec64b831115073709ac1))

## [0.4.1](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.4.0...v0.4.1) (2026-09-07)


### Bug Fixes

* **agent:** read a property holding undefined as the absence JSON makes of it ([#32](https://github.com/ChidiRnweke/FollowThrough.ai/issues/32)) ([fea50a9](https://github.com/ChidiRnweke/FollowThrough.ai/commit/fea50a9ce63f63f05fd0a0fd5f3c99830c40e7b7))
* **diagrams:** stop refusing ordinary diagrams, and stop latching the pane when one is refused ([#33](https://github.com/ChidiRnweke/FollowThrough.ai/issues/33)) ([bb68d28](https://github.com/ChidiRnweke/FollowThrough.ai/commit/bb68d28cf332962b9e4c4c6f8dcb87c7df749a4c))

## [0.4.0](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.3.6...v0.4.0) (2026-09-07)


### Features

* **design:** enforce refactoring ui checks with a ui audit and skill ([#30](https://github.com/ChidiRnweke/FollowThrough.ai/issues/30)) ([5e045c6](https://github.com/ChidiRnweke/FollowThrough.ai/commit/5e045c6d13b2cc2a3ba6d7060b5c991e98a89e96))

## [0.3.6](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.3.5...v0.3.6) (2026-09-06)


### Bug Fixes

* **chat:** give a turn's activity a type pyramid, a teal evidence surface, and its open link back ([#27](https://github.com/ChidiRnweke/FollowThrough.ai/issues/27)) ([4c05107](https://github.com/ChidiRnweke/FollowThrough.ai/commit/4c051073382f5e5e255ef3c4cdf14ca00806e682))

## [0.3.5](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.3.4...v0.3.5) (2026-09-06)


### Bug Fixes

* **chat:** space and colour a turn's activity so its groups and its actions read ([#24](https://github.com/ChidiRnweke/FollowThrough.ai/issues/24)) ([f156670](https://github.com/ChidiRnweke/FollowThrough.ai/commit/f1566709d4a39053dd881830e82ff1eb87b62d38))

## [0.3.4](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.3.3...v0.3.4) (2026-09-06)


### Bug Fixes

* **ci:** call the image publish from the release run so deploys happen ([#21](https://github.com/ChidiRnweke/FollowThrough.ai/issues/21)) ([b6daaa8](https://github.com/ChidiRnweke/FollowThrough.ai/commit/b6daaa83dc8d1495c168c628be2047b573a43b35))

## [0.3.3](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.3.2...v0.3.3) (2026-09-06)


### Bug Fixes

* **ui:** improve secondary text on colored surfaces ([#19](https://github.com/ChidiRnweke/FollowThrough.ai/issues/19)) ([f358294](https://github.com/ChidiRnweke/FollowThrough.ai/commit/f35829472337edb2fa9b770d3addb8cd1ff9034b))

## [0.3.2](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.3.1...v0.3.2) (2026-09-06)


### Bug Fixes

* **release:** release on every change that can reach production ([#17](https://github.com/ChidiRnweke/FollowThrough.ai/issues/17)) ([8a93631](https://github.com/ChidiRnweke/FollowThrough.ai/commit/8a93631235d4de47585007725d589ff9da1112db))


### Code Refactoring

* **chat:** fold a turn's activity into the things it touched ([#16](https://github.com/ChidiRnweke/FollowThrough.ai/issues/16)) ([9dcfd10](https://github.com/ChidiRnweke/FollowThrough.ai/commit/9dcfd1093cf847969cfd403de9c697be3f8f722e))

## [0.3.1](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.3.0...v0.3.1) (2026-09-06)


### Performance Improvements

* **tests:** cut suite memory ~25% and wall time ~35% ([#14](https://github.com/ChidiRnweke/FollowThrough.ai/issues/14)) ([87f5637](https://github.com/ChidiRnweke/FollowThrough.ai/commit/87f563791341b406f78c701a7bc06474101f8a0b))

## [0.3.0](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.2.0...v0.3.0) (2026-09-06)


### Features

* **agent:** make tool activity directly navigable ([#10](https://github.com/ChidiRnweke/FollowThrough.ai/issues/10)) ([70611d3](https://github.com/ChidiRnweke/FollowThrough.ai/commit/70611d3ac8243f23592944c95171c1b3e3243239))

## [0.2.0](https://github.com/ChidiRnweke/FollowThrough.ai/compare/v0.1.0...v0.2.0) (2026-09-06)


### Features

* **chat:** open a chat diagram at full size on click ([#6](https://github.com/ChidiRnweke/FollowThrough.ai/issues/6)) ([a23bed4](https://github.com/ChidiRnweke/FollowThrough.ai/commit/a23bed46d3e196781800abde1b85e35e1a8fa305))


### Bug Fixes

* **release:** use release-please's default node input mode ([#8](https://github.com/ChidiRnweke/FollowThrough.ai/issues/8)) ([d60757f](https://github.com/ChidiRnweke/FollowThrough.ai/commit/d60757f6f73962db3ac2d390f405947783eb5956))

## [0.1.0] — 2026-09-06

First versioned release, tagged as the baseline for commit-driven releases. Everything before
this tag predates the enforced conventional-commit convention and is not itemized here.

### Features

- Conventional commits are enforced on every pull request: commitlint on PR commits and
  pushes to master, and a title check under squash-only merging. See ADR 0038.
- Commits now come from a protected master: pull requests required, squash-merge only, linear
  history, direct pushes disabled.
- Releases are generated by release-please from conventional commits and land through a
  human-reviewed release PR. See ADR 0039.
- The docs site gains a Releases page generated from this changelog.
