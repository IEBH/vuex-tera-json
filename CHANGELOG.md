# Changelog

## [3.0.8](https://github.com/IEBH/vuex-tera-json/compare/3.0.7...3.0.8) (2025-11-14)


### feat

* Optional resetState function to be called when loading file ([97802fa](https://github.com/IEBH/vuex-tera-json/commit/97802fa6c8426f8893ce05e51480fdc89e26658d))

## [3.0.7](https://github.com/IEBH/vuex-tera-json/compare/3.0.6...3.0.7) (2025-11-07)


### chore

* Revert to REST endpoints for file handling ([161de29](https://github.com/IEBH/vuex-tera-json/commit/161de29b00eb4b49b7594066599b1a35523570f8))

### devops

* Both ESM and CJS builds ([909cc41](https://github.com/IEBH/vuex-tera-json/commit/909cc41e554272a021f1d47f094a01ef8f78251b))

## [3.0.6](https://github.com/IEBH/vuex-tera-json/compare/3.0.5...3.0.6) (2025-10-31)


### feat

* Re-implement ext filtering with upstream TERA fixes ([63408d5](https://github.com/IEBH/vuex-tera-json/commit/63408d518bb11fd5eca34e57f7225394107932a9))

### temp

* Revert to old saving/loading system until caching worked out ([f3c84e1](https://github.com/IEBH/vuex-tera-json/commit/f3c84e17279e0a073e103176db6c8de903107a49))

## [3.0.5](https://github.com/IEBH/vuex-tera-json/compare/3.0.4...3.0.5) (2025-10-09)


### temp

* Revert json filtering until no files showing is fixed ([fc92453](https://github.com/IEBH/vuex-tera-json/commit/fc92453bb3d0533626dfdc6a5f16a6fa8f13c15d))

## [3.0.4](https://github.com/IEBH/vuex-tera-json/compare/3.0.3...3.0.4) (2025-10-09)


### feat

* Filter by json ext in json recovery mode ([e231f0f](https://github.com/IEBH/vuex-tera-json/commit/e231f0f98c196429ffe773b73204811a869f51f9))

## [3.0.3](https://github.com/IEBH/vuex-tera-json/compare/3.0.2...3.0.3) (2025-08-12)


### chore

* Use proxy worker dev endpoint to fix Bond ECH issue ([ec396cc](https://github.com/IEBH/vuex-tera-json/commit/ec396cce3e1af502c586a07a68223e1be42df350))

## [3.0.2](https://github.com/IEBH/vuex-tera-json/compare/3.0.1...3.0.2) (2025-08-12)


### chore

* Use fixed version of tera-io endpoint ([ac0ea1c](https://github.com/IEBH/vuex-tera-json/commit/ac0ea1c50c1c3792ea929691fcd987616497c75e))

## [3.0.1](https://github.com/IEBH/vuex-tera-json/compare/3.0.0...3.0.1) (2025-08-12)


### chore

* Add tera-fy as peer dependency ([53c6fdb](https://github.com/IEBH/vuex-tera-json/commit/53c6fdb2ebe3e0e85053c19055bb5119c8674227))

### devops

* Add watch command ([f4c95d2](https://github.com/IEBH/vuex-tera-json/commit/f4c95d2e1d92303fcc9f16cf7fbd89dc4e360d7a))

### fix

* Point to dev remote endpoint ([c4fedf3](https://github.com/IEBH/vuex-tera-json/commit/c4fedf32dbd326f1f62fcf337f5bb4bf886e875f))

# [3.0.0](https://github.com/IEBH/vuex-tera-json/compare/tera-io...3.0.0) (2025-08-07)


### major

* Finish tera-io implementation + refactor ([55b573f](https://github.com/IEBH/vuex-tera-json/commit/55b573f12d7b6601f41350b460fc38b65c1509bc))

## [2.4.2](https://github.com/IEBH/vuex-tera-json/compare/2.4.1...2.4.2) (2025-08-01)


### fix

* Add missing getter ([d4d9177](https://github.com/IEBH/vuex-tera-json/commit/d4d9177b2c8bcc342dac17d039ae235d6bf57503))

## [2.4.1](https://github.com/IEBH/vuex-tera-json/compare/TS-CONVERSION...2.4.1) (2025-08-01)


### chore

* Version bump 2.4.0 for TS version ([fc19bb9](https://github.com/IEBH/vuex-tera-json/commit/fc19bb9de6624465c7bc3abe08f467ccfa6aa0fa))

## [2.3.3](https://github.com/IEBH/vuex-tera-json/compare/2.1.5...2.3.3) (2025-07-25)


### chore

* Remove console.log ([d3facfe](https://github.com/IEBH/vuex-tera-json/commit/d3facfe9f7eb9fedac2349ddcab65d9faeb3e112))
* Version bump ([9b2d343](https://github.com/IEBH/vuex-tera-json/commit/9b2d343d3a93a8ee8a6e53e2a7f538735a1d536b))

### feat

* onBeforeSave() which validates whether state can be saved ([1ea51dc](https://github.com/IEBH/vuex-tera-json/commit/1ea51dc465c387f156a15a1bd3d4704d693359b4))
* release-it for npm publishing ([59ae356](https://github.com/IEBH/vuex-tera-json/commit/59ae35604f6bc2f65f4f6f6193537da2e249600d))

### fix

* Tweak code for showing notification ([f9ea6cd](https://github.com/IEBH/vuex-tera-json/commit/f9ea6cd19f1ea32cb59b982959cf97f2b3b69301))
