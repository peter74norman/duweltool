'use strict'
// @ts-check

const DEFAULT_SELECT_VALUE = '-'

function lerp(a, b, f) {
    return a + f * (b - a)
}

// var processes = {
//     MIG: 0.9,
//     TIG: 0.8,
//     forceTIG: 0.8
// }

var App = React.createClass({
    getInitialState: function() {
        return {
            filter: {},
            selectors: [],
            availableSelectors: [],
            hits: [],
            sliders: {},
            recommendations: [],
            results: [],
            enableSliders: false,
            showResults: false,
            processSliderRanges: []
        }
    },
    componentDidMount: function() {
        var self = this

        // Load recommendations
        $.getJSON(`data/data.json?cache_bust=${Date.now()}`)
            .done(function(data) {
                self.setState({ results: data.results })

                // Build selectors from results
                var selectors = []

                // Material
                selectors.push({
                    id: 'material',
                    title: 'Material',
                    disabled: false,
                    options: _(self.state.results)
                        .uniq('material')
                        .map(function(result) {
                            return {
                                id: result.material
                            }
                        })
                        .value()
                })

                // Thickness
                selectors.push({
                    id: 'thickness',
                    title: 'Thickness',
                    disabled: true,
                    options: _(self.state.results)
                        .uniq('thickness')
                        .map(function(result) {
                            return {
                                id: result.thickness
                            }
                        })
                        .sortBy('id')
                        .value()
                })

                // Layers
                selectors.push({
                    id: 'layers',
                    title: 'Layers',
                    disabled: true,
                    options: _(self.state.results)
                        .uniq('layers')
                        .map(function(result) {
                            return {
                                id: result.layers
                            }
                        })
                        .sortBy('-layers')
                        .value()
                })

                // Joint Type
                selectors.push({
                    id: 'jointType',
                    title: 'Joint Type',
                    disabled: true,
                    options: _(self.state.results)
                        .uniq('jointType')
                        .map(function(result) {
                            return {
                                id: result.jointType
                            }
                        })
                        .value()
                })

                // Process
                selectors.push({
                    id: 'process',
                    title: 'Process',
                    disabled: true,
                    options: _(self.state.results)
                        .uniq('process')
                        .map(function(result) {
                            return {
                                id: result.process
                            }
                        })
                        .value()
                })

                // Filler
                selectors.push({
                    id: 'filler',
                    title: 'Filler',
                    disabled: true,
                    options: _(self.state.results)
                        .uniq('filler')
                        .map(function(result) {
                            return {
                                id: result.filler
                            }
                        })
                        .value()
                })

                // Shielding Gas
                selectors.push({
                    id: 'shieldingGas',
                    title: 'Shielding Gas',
                    disabled: true,
                    options: _(self.state.results)
                        .uniq('shieldingGas')
                        .map(function(result) {
                            return {
                                id: result.shieldingGas
                            }
                        })
                        .value()
                })

                self.setState({
                    selectors: selectors,
                    availableSelectors: selectors,
                    processSliderRanges: data.processSliderRanges,
                    recommendations: data.recommendations,
                    standardRequirements: data.standardRequirements,
                    processEfficiency: data.processEfficiency
                })
            })
            .fail(function(jqxhr, textStatus, error) {
                console.error('Failed to fetch data: ' + textStatus + ', ' + error)
            })
    },
    selectorValueChanged: function(selectorId, value) {
        var filter
        if (value == DEFAULT_SELECT_VALUE) {
            filter = this.state.filter
            delete filter[selectorId]
        } else {
            // Thickness is a number but comes in as a string from the <Selector>
            if (selectorId == 'thickness') {
                value = parseInt(value)
            }

            // Update filter with the new selector value
            filter = this.state.filter
            filter[selectorId] = value
        }

        this.setState({ filter: filter }, this.runFilter)
    },
    sliderValueChanged: function(selectorId, value) {
        var sliders = this.state.sliders
        sliders[selectorId] = parseFloat(value)
        this.setState({ sliders: sliders }, function() {
            this.runFilter()
        })
    },
    getArcEnergy: function() {
        // Convert welding speed from cm/min to mm/sec
        var weldingSpeedMMPerSec = (this.state.sliders.weldingSpeed * 10) / 60

        // Calculate Arc Energy
        var arcEnergy = (this.state.sliders.current * this.state.sliders.voltage) / weldingSpeedMMPerSec

        // Convert Arc Energy to Kilo Joule
        var arcEnergyKiloJoule = arcEnergy / 1000

        return arcEnergyKiloJoule
    },
    runFilter: function() {
        // Update hits by filtering the results
        var hits = _.filter(this.state.results, this.state.filter)

        var previousSelector
        var previousSelectorDisabled = false
        var filterIdsToClear = []

        // Limit available selectors and their options using generated hits
        var availableSelectors = this.state.selectors.map((selector, i) => {
            // Disable options
            selector.options.forEach(function(option) {
                var match = {}
                match[selector.id] = option.id
                option.disabled = !_.any(hits, match)
            })

            if (previousSelector) {
                // If previous selector is NOT filled in (selected), disable current selector
                selector.disabled = !this.state.filter[previousSelector.id]
                if (selector.disabled && this.state.filter[selector.id]) {
                    // If current selector is filled in from before, then clear it
                    filterIdsToClear.push(selector.id)
                }
            }

            previousSelector = selector
            previousSelectorDisabled = selector.disabled

            return selector
        })

        if (filterIdsToClear.length > 0) {
            // If any filters need to be cleaned, then clean them and run the filter process again
            var cleanedFilter = this.state.filter

            filterIdsToClear.forEach(filterId => {
                delete cleanedFilter[filterId]
            })

            this.setState({ filter: cleanedFilter }, this.runFilter)
            return
        }

        // Find recommendation based out of selected Material
        var recommendation = 'Select material to enable recommendation.'
        if (this.state.filter.material) {
            var recommendationObj = _.find(this.state.recommendations, {
                material: this.state.filter.material
            })
            if (recommendationObj) {
                recommendation = recommendationObj.recommendation
            } else {
                recommendation = 'No recommendation found for current selected material'
            }
        }

        // If process has been selected, then add interpolated hit
        var simulatedHit = {}
        simulatedHit.interpolated = true
        simulatedHit.arcEnergy = this.getArcEnergy()
        if (this.state.filter.process) {
            simulatedHit.heatInput = simulatedHit.arcEnergy * this.state.processEfficiency[this.state.filter.process]
        }
        hits.push(simulatedHit)

        hits.sort(function(a, b) {
            return b.heatInput - a.heatInput
        })

        // Interpolate values in the simulated hit row using the closest hit above and below
        var simulatedHitIndex = hits.indexOf(simulatedHit)
        if (simulatedHitIndex > 0 && simulatedHitIndex < hits.length - 1) {
            // Interpolation can me made (or at least tried, adjacent rows might not contain complete data in their columns)
            var aboveHit = hits[simulatedHitIndex - 1]
            var belowHit = hits[simulatedHitIndex + 1]
            var max = aboveHit.heatInput - belowHit.heatInput
            var sim = simulatedHit.heatInput - belowHit.heatInput
            var t = sim / max
            simulatedHit.ferrite = lerp(belowHit.ferrite, aboveHit.ferrite, t)
            simulatedHit.austenite = lerp(belowHit.austenite, aboveHit.austenite, t)
        }

        this.setState({
            hits: hits,
            availableSelectors: availableSelectors,
            recommendation: recommendation,
            showResults: Object.keys(this.state.filter).length >= 7
        })
    },
    processSliderRanges(sliderId) {
        const selectedProcess = this.state.filter['process']
        if (!selectedProcess) return [0, 100]

        const selectedProcessSliderRanges = this.state.processSliderRanges[selectedProcess]
        if (!selectedProcessSliderRanges) {
            throw new Error(`Could not find slider ranges for process: ${selectedProcess}`)
        }

        return selectedProcessSliderRanges[sliderId].split('-').map(val => parseInt(val))
    },
    render: function() {
        if (this.state.selectors.length < 1) {
            return <div>Loading ...</div>
        }

        var hideSection2 = Object.keys(this.state.filter).length < 4

        var section2ClassNames = classNames({
            section: true,
            group: true,
            hidden: hideSection2
        })

        var sliderSectionClassNames = classNames({
            section: true,
            group: true,
            hidden: !this.state.showResults
        })

        return (
            <div>
                <SectionTitle title="Defining joint" number="1" />
                <div className="section group">
                    <Selector
                        data={_.find(this.state.availableSelectors, { id: 'material' })}
                        valueChanged={this.selectorValueChanged}
                        optionsType="column"
                    />
                    <Selector
                        data={_.find(this.state.availableSelectors, { id: 'thickness' })}
                        valueChanged={this.selectorValueChanged}
                        optionsType="grid"
                        valueDescription="mm"
                    />
                    <Selector
                        data={_.find(this.state.availableSelectors, { id: 'layers' })}
                        valueChanged={this.selectorValueChanged}
                        optionsType="column"
                    />
                    <Selector
                        data={_.find(this.state.availableSelectors, { id: 'jointType' })}
                        valueChanged={this.selectorValueChanged}
                        optionsType="column"
                        icons={true}
                    />
                </div>
                <Recommendation
                    text={this.state.recommendation}
                    show={!hideSection2}
                    standard={this.state.standardRequirements}
                    material={this.state.filter.material}
                />
                <SectionTitle
                    title="Process parameters"
                    number="2"
                    disabled={Object.keys(this.state.filter).length < 3}
                    show={!hideSection2}
                />
                <div className={section2ClassNames}>
                    <Selector
                        data={_.find(this.state.availableSelectors, { id: 'process' })}
                        valueChanged={this.selectorValueChanged}
                        optionsType="column"
                    />
                    <Selector
                        data={_.find(this.state.availableSelectors, { id: 'filler' })}
                        valueChanged={this.selectorValueChanged}
                        optionsType="column"
                    />
                    <Selector
                        data={_.find(this.state.availableSelectors, { id: 'shieldingGas' })}
                        valueChanged={this.selectorValueChanged}
                        optionsType="column"
                        icons={true}
                    />
                </div>
                <div className={sliderSectionClassNames}>
                    <Slider
                        data={{
                            id: 'current',
                            title: 'Current',
                            disabled: !this.state.showResults,
                            min: this.processSliderRanges('current')[0],
                            max: this.processSliderRanges('current')[1],
                            step: 1,
                            format: '0'
                        }}
                        valueChanged={this.sliderValueChanged}
                        valueDescription="A"
                    />
                    <Slider
                        data={{
                            id: 'voltage',
                            title: 'Voltage',
                            disabled: !this.state.showResults,
                            min: this.processSliderRanges('voltage')[0],
                            max: this.processSliderRanges('voltage')[1],
                            step: 0.1,
                            format: '0.[0]'
                        }}
                        valueChanged={this.sliderValueChanged}
                        valueDescription="V"
                    />
                    <Slider
                        data={{
                            id: 'weldingSpeed',
                            title: 'Welding speed',
                            disabled: !this.state.showResults,
                            min: this.processSliderRanges('weldingSpeed')[0],
                            max: this.processSliderRanges('weldingSpeed')[1],
                            step: 1,
                            format: '0'
                        }}
                        valueChanged={this.sliderValueChanged}
                        valueDescription="cm/min"
                    />
                </div>
                <SectionTitle title="Results" number="3" show={this.state.showResults} />
                <Hits hits={this.state.hits} show={this.state.showResults} />
            </div>
        )
    }
})

var SectionTitle = React.createClass({
    render: function() {
        if (!this.props.show) {
            return false
        }

        var mainClassNames = classNames({
            'center-container': true,
            disabled: this.props.disabled
        })
        return (
            <h2>
                <span className={mainClassNames}>
                    <span className="title">
                        <span className="number">{this.props.number}</span>
                        {this.props.title}
                    </span>
                </span>
            </h2>
        )
    }
})

var Selector = React.createClass({
    getInitialState: function() {
        return {
            expanded: false,
            value: DEFAULT_SELECT_VALUE
        }
    },
    componentDidMount: function() {
        window.addEventListener('click', this.hide)
    },
    hide: function() {
        this.setState({ expanded: false })
    },
    isFilled: function() {
        return this.state.value != DEFAULT_SELECT_VALUE
    },
    componentWillReceiveProps: function(nextProps) {
        if (nextProps.data.disabled) {
            this.setState({ value: DEFAULT_SELECT_VALUE })
        }
    },
    toggle: function(event) {
        if (this.isFilled()) {
            this.setState({ value: DEFAULT_SELECT_VALUE })
            this.props.valueChanged(this.props.data.id, DEFAULT_SELECT_VALUE)
        } else {
            this.setState({ expanded: !this.state.expanded })
        }
        event.stopPropagation()
    },
    select: function(event) {
        var selectedValue = $(event.currentTarget)
            .find('.value')
            .text()
        this.props.valueChanged(this.props.data.id, selectedValue)
        this.setState({ value: selectedValue })
    },
    getJointTypeIcon: function(name) {
        if (name == 'Butt-joint') {
            return (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 62 34" version="1.1">
                    <g stroke="none" strokeWidth="1" fill="none" fill-rule="evenodd">
                        <path d="M34 1C34 0.4 34.4 0 35 0L61 0C61.6 0 62 0.5 62 1L62 33C62 33.6 61.6 34 61 34L35 34C34.4 34 34 33.5 34 33L34 1ZM0 1C0 0.4 0.4 0 1 0L27 0C27.6 0 28 0.5 28 1L28 33C28 33.6 27.6 34 27 34L1 34C0.4 34 0 33.5 0 33L0 1Z" />
                    </g>
                </svg>
            )
        } else if (name == 'V-groove') {
            return (
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="34" viewBox="0 0 64 34" version="1.1">
                    <title>icon_joint_05</title>
                    <desc>Created with Sketch.</desc>
                    <g stroke="none" strokeWidth="1" fill="none" fill-rule="evenodd">
                        <path
                            d="M63 0C63.6 0 64 0.5 64 1L64 33C64 33.6 63.6 34 63 34L34 34C33.4 34 33.2 33.6 33.5 33.1L52.1 0.9C52.4 0.4 53 0 53.6 0L63 0ZM1 0C0.4 0 0 0.5 0 1L0 33C0 33.6 0.4 34 1 34L30 34C30.6 34 30.8 33.6 30.5 33.1L11.9 0.9C11.6 0.4 11 0 10.4 0L1 0Z"
                            fill="#F6A623"
                        />
                    </g>
                </svg>
            )
        } else {
            return false // No icon for this
        }
    },
    render: function() {
        var subSectionClassNames = classNames({
            'sub-section': true,
            disabled: this.props.data.disabled
        })

        var selectorClassNames = classNames({
            selector: true,
            'disable-text-selection': true,
            'selector-filled': this.isFilled()
        })

        var icon = this.isFilled() ? '✖' : '▼'

        var optionsContainerClassNames = classNames({
            'options-container': true,
            'options-container-visible': this.state.expanded
        })

        var optionsTypeClassNames = classNames({
            'options-column': this.props.optionsType == 'column',
            'options-grid': this.props.optionsType == 'grid'
        })

        // Option icons
        if (this.props.icons) {
            var selectorIcon
            if (this.isFilled()) {
                selectorIcon = this.getJointTypeIcon(1)
            }
        }

        var options = this.props.data.options.map(option => {
            var disabled = option.disabled
            if (option.id) {
                option = option.id
            }
            var optionClassNames = classNames({
                option: true,
                selected: this.state.value == option,
                disabled: disabled
            })

            var optionIcon
            if (this.props.icons) {
                var optionIcon = this.getJointTypeIcon(option)
            }
            if (this.props.optionsType == 'column') {
                return (
                    <div className={optionClassNames} onClick={this.select} key={option}>
                        {optionIcon}
                        <span className="value">{option}</span>
                    </div>
                )
            } else {
                return (
                    <div className={optionClassNames} onClick={this.select} key={option}>
                        <div>
                            <span className="value">{option}</span>
                        </div>
                    </div>
                )
            }
        })

        return (
            <div className={subSectionClassNames}>
                <p className="sub-section-title">
                    {this.props.data.title}
                    <small>{this.props.valueDescription}</small>
                </p>
                <div className={selectorClassNames} onClick={this.toggle}>
                    {selectorIcon}
                    <span>{this.state.value}</span>
                    <span className="selector-icon">{icon}</span>
                </div>
                <div className={optionsContainerClassNames}>
                    <div className={optionsTypeClassNames}>{options}</div>
                </div>
            </div>
        )
    }
})

var Slider = React.createClass({
    getInitialState: function() {
        return {
            value: this.props.data.min
        }
    },
    componentDidMount: function() {
        // Setup slider
        var sliderElement = this.refs.slider
        noUiSlider.create(sliderElement, {
            start: [this.props.data.min],
            range: {
                min: this.props.data.min,
                max: this.props.data.max
            },
            step: this.props.data.step || 1
        })
        sliderElement.noUiSlider.on('update', () => {
            this.handleChange(sliderElement.noUiSlider.get())
        })

        // Minus
        $(this.refs.minus).click(() => {
            let current = parseFloat(sliderElement.noUiSlider.get())
            sliderElement.noUiSlider.set(parseFloat(sliderElement.noUiSlider.get()) - this.props.data.step)
        })

        // Plus
        $(this.refs.plus).click(() => {
            sliderElement.noUiSlider.set(parseFloat(sliderElement.noUiSlider.get()) + this.props.data.step)
        })
    },
    componentDidUpdate(oldProps) {
        if (oldProps.data.min == this.props.data.min && oldProps.data.max == this.props.data.max) {
            return
        }

        var sliderElement = this.refs.slider
        sliderElement.noUiSlider.updateOptions({
            range: {
                min: this.props.data.min,
                max: this.props.data.max
            }
        })
        sliderElement.noUiSlider.set(this.props.data.min)
    },
    handleChange: function(value) {
        this.props.valueChanged(this.props.data.id, value)
        this.setState({ value: value })
    },
    render: function() {
        var subSectionClassNames = classNames({
            'sub-section': true,
            'slider-sub-section': true,
            disabled: this.props.data.disabled
        })

        return (
            <div className={subSectionClassNames}>
                <p className="sub-section-title">
                    {this.props.data.title}
                    <small>{this.props.valueDescription}</small>
                </p>
                <p className="slider-value">{numeral(this.state.value).format(this.props.data.format || '0')}</p>
                <div className="slider-container disable-text-selection group">
                    <p className="slider-stepper minus" ref="minus">
                        -
                    </p>
                    <div className="slider" ref="slider"></div>
                    <p className="slider-stepper plus" ref="plus">
                        +
                    </p>
                </div>
            </div>
        )
    }
})

var Recommendation = React.createClass({
    getInitialState() {
        return {
            showStandardRequirements: false
        }
    },
    toggle() {
        this.setState({ showStandardRequirements: !this.state.showStandardRequirements })
    },
    render: function() {
        if (!this.props.show) {
            return false
        }

        var recommendationsText = {
            __html: marked(this.props.text)
        }
        var recommendations = <div className="recommendation" dangerouslySetInnerHTML={recommendationsText}></div>

        const selectedMaterial = this.props.standard.find(req => req.material == this.props.material)
        var standardRequirements = null
        if (selectedMaterial) {
            var requirements = selectedMaterial.requirements
            var standardRequirementsContent = { __html: marked(requirements) }
            standardRequirements = this.state.showStandardRequirements ? (
                <div
                    className="standard-reqirements-component"
                    dangerouslySetInnerHTML={standardRequirementsContent}
                ></div>
            ) : null
        }

        var chevronClassNames = classNames({
            chevron: true,
            rotated: this.state.showStandardRequirements
        })

        var toggleText = this.state.showStandardRequirements ? 'Hide' : 'Show'
        

        return (
            <div className="recommendation-container">
                <div className="recommendations">{recommendations}</div>
                <div className="standard-requirements" onClick={this.toggle}>
                    <h4>
                        <div>Standard Requirements</div>
                        <div className={chevronClassNames}>{toggleText}</div>
                    </h4>
                    {standardRequirements}
                </div>
            </div>
        )
    }
})

var Hits = React.createClass({
    render: function() {
        if (!this.props.show) {
            return false
        }

        // Build row
        var rows = this.props.hits.map(function(hit, i) {
            var trClassNames = classNames({
                interpolated: hit.interpolated
            })

            // out of range
            if (hit.interpolated && i == 0) {
                return (
                    <tr className={trClassNames} key={i}>
                        <td colSpan="14">Out of range</td>
                    </tr>
                )
            }

            const onOffMark = on => {
                return on ? '✔' : <span style={{ color: 'red', opacity: 0.7 }}>︎︎︎-</span>
            }

            var verifiedIcon = onOffMark(hit.verified)

            var ferrite = hit.ferrite ? numeral(hit.ferrite).format('0')  + ' %': ''

            // Standard Ferrite Requirements
            var standardFerriteRequirements = []
            standardFerriteRequirements[0] = onOffMark(!!hit['EN ISO 17781:2017'])
            standardFerriteRequirements[1] = onOffMark(!!hit['EN 13445-4: 2014'])
            standardFerriteRequirements[2] = onOffMark(!!hit['EN ISO 1011-3:2018'])
            standardFerriteRequirements[3] = onOffMark(!!hit['ISO 15156-3:2015'])
            standardFerriteRequirements[4] = onOffMark(!!hit['API 938C:2011'])
            standardFerriteRequirements[5] = onOffMark(!!hit['M-630:2013'])
            standardFerriteRequirements[6] = onOffMark(!!hit['M-601:2016'])

            var heatInput = hit.heatInput ? numeral(hit.heatInput).format('0.00') + ' kJ/mm' : ''
            var arcEnergy = hit.arcEnergy ? numeral(hit.arcEnergy).format('0.00') + ' kJ/mm' : ''

            var pdf = ''
            if (hit.pdf) {
                var url = '/data/pdf/' + hit.pdf
                pdf = (
                    <a href={url} target="_blank">
                        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 482 482">
                            <path
                                d="M142.024,310.194c0-8.007-5.556-12.782-15.359-12.782c-4.003,0-6.714,0.395-8.132,0.773v25.69
		c1.679,0.378,3.743,0.504,6.588,0.504C135.57,324.379,142.024,319.1,142.024,310.194z"
                            />
                            <path
                                d="M202.709,297.681c-4.39,0-7.227,0.379-8.905,0.772v56.896c1.679,0.394,4.39,0.394,6.841,0.394
		c17.809,0.126,29.424-9.677,29.424-30.449C230.195,307.231,219.611,297.681,202.709,297.681z"
                            />
                            <path
                                d="M315.458,0H121.811c-28.29,0-51.315,23.041-51.315,51.315v189.754h-5.012c-11.418,0-20.678,9.251-20.678,20.679v125.404
		c0,11.427,9.259,20.677,20.678,20.677h5.012v22.995c0,28.305,23.025,51.315,51.315,51.315h264.223
		c28.272,0,51.3-23.011,51.3-51.315V121.449L315.458,0z M99.053,284.379c6.06-1.024,14.578-1.796,26.579-1.796
		c12.128,0,20.772,2.315,26.58,6.965c5.548,4.382,9.292,11.615,9.292,20.127c0,8.51-2.837,15.745-7.999,20.646
		c-6.714,6.32-16.643,9.157-28.258,9.157c-2.585,0-4.902-0.128-6.714-0.379v31.096H99.053V284.379z M386.034,450.713H121.811
		c-10.954,0-19.874-8.92-19.874-19.889v-22.995h246.31c11.42,0,20.679-9.25,20.679-20.677V261.748
		c0-11.428-9.259-20.679-20.679-20.679h-246.31V51.315c0-10.938,8.921-19.858,19.874-19.858l181.89-0.19v67.233
		c0,19.638,15.934,35.587,35.587,35.587l65.862-0.189l0.741,296.925C405.891,441.793,396.987,450.713,386.034,450.713z
		 M174.065,369.801v-85.422c7.225-1.15,16.642-1.796,26.58-1.796c16.516,0,27.226,2.963,35.618,9.282
		c9.031,6.714,14.704,17.416,14.704,32.781c0,16.643-6.06,28.133-14.453,35.224c-9.157,7.612-23.096,11.222-40.125,11.222
		C186.191,371.092,178.966,370.446,174.065,369.801z M314.892,319.226v15.996h-31.23v34.973h-19.74v-86.966h53.16v16.122h-33.42
		v19.875H314.892z"
                            />
                        </svg>
                    </a>
                )
            }

            return (
                <tr className={trClassNames} key={i}>
                    <td>{heatInput}</td>
                    <td>{arcEnergy}</td>
                    {/* <td>{hit.delta85}</td> */}
                    {/* <td>{hit.delta128}</td> */}
                    <td>{ferrite}</td>
                    <td>{standardFerriteRequirements[0]}</td>
                    <td>{standardFerriteRequirements[1]}</td>
                    <td>{standardFerriteRequirements[2]}</td>
                    <td>{standardFerriteRequirements[3]}</td>
                    <td>{standardFerriteRequirements[4]}</td>
                    <td>{standardFerriteRequirements[5]}</td>
                    <td>{standardFerriteRequirements[6]}</td>
                    {/* <td>{austenite}</td> */}
                    <td>{hit.sigmaPhase}</td>
                   
                    <td className="pdf">{pdf}</td>
                </tr>
            )
        })

        // Build table
        return (
            <table>
                <thead>
                    <tr>
                        <th>Heat input</th>
                        <th>Arc energy</th>
                        <th>
                            Average Ferrite 
                        </th>
                        <th>
                            <div className="rotate">EN ISO 17781:2017</div>
                        </th>
                        <th>
                            <div className="rotate">EN 13445-4: 2014</div>
                        </th>
                        <th>
                            <div className="rotate">EN ISO 1011-3:2018</div>
                        </th>
                        <th>
                            <div className="rotate">ISO 15156-3:2015</div>
                        </th>
                        <th>
                            <div className="rotate">API 938C:2011</div>
                        </th>
                        <th>
                            <div className="rotate">M-630:2013</div>
                        </th>
                        <th style={{ width: '88px' }}>
                            <div className="rotate">M-601:2016</div>
                        </th>
                        <th>Sigma phase</th>
                       
                        <th>Pdf</th>
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </table>
        )
    }
})

ReactDOM.render(<App />, document.getElementById('app'))
