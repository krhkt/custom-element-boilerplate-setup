## Custom Element boilerplate setup

Initializer for the [`github/custom-element-boilerplate`](https://github.com/github/custom-element-boilerplate) repository template.

This is a simple package to help replacing the `custom-element` strings throughout the project with the custom element name to be used.

### Instructions

Once your repository is created and cloned, simply run:

```sh
npx @krhkt/custom-element-boilerplate-setup
```

And write the custom element class name to be used in pascal case sentence, without the `Element` suffix. Or leave it blank to use the default suggestion.

Note: You can run passing the option `--verbose`, if you want to see more information about the each step.

__warning__: this script can only be `npx` executed in unix environments. If you're on a windows environment, please install the package as a dev dependency and run the main script manually.
